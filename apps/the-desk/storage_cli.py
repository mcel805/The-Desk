"""Verified restore copies and offline single-database installation."""
import argparse
import json
import os
from pathlib import Path
import shutil
import tempfile
import time
from storage import DataVault,DirectoryLock,DATABASES,inspect_database,fsync_dir,atomic_json

def install(vault,sid,name):
    if name not in DATABASES:raise ValueError('Only Desk-owned databases can be installed. Restore Journal into a new folder and use its own offline recovery procedure.')
    with DirectoryLock(vault.directory):
        vault.verify(sid);manifest=vault.manifest(sid)
        if name not in manifest['files']:raise ValueError('Database is absent from this backup')
        src=vault.root/sid/name;inspect_database(src)
        # Copy the replacement fully before moving any existing file.
        fd,temp=tempfile.mkstemp(prefix='.restore-',dir=vault.directory);os.close(fd);temp=Path(temp)
        quarantine=vault.directory/'recovery'/('before-restore-'+str(time.time_ns()));quarantine.mkdir(parents=True,mode=0o700)
        moved=[]
        try:
            shutil.copyfile(src,temp);temp.chmod(0o600);inspect_database(temp)
            with open(temp,'rb') as f:os.fsync(f.fileno())
            for suffix in ('','-wal','-shm'):
                current=vault.directory/(name+suffix)
                if current.exists():os.replace(current,quarantine/current.name);moved.append(current.name)
            os.replace(temp,vault.directory/name);fsync_dir(vault.directory);fsync_dir(quarantine)
            atomic_json(quarantine/'restore-receipt.json',{'backup':sid,'database':name,'prior_files':moved,'installed_at':int(time.time()*1000),
                'warning':'Records newer than this backup are not in the installed database. Previous files remain here for investigation.'})
        except BaseException:
            for old in moved:
                if (quarantine/old).exists():os.replace(quarantine/old,vault.directory/old)
            raise
        finally:
            if temp.exists():temp.unlink()
        return {'installed':name,'backup':sid,'previous_files':str(quarantine),'reconnect_accounts':True,'collection':'paused after restart'}

def main():
    p=argparse.ArgumentParser();p.add_argument('--data-dir',default=os.environ.get('DESK_DATA_DIR',str(Path(__file__).with_name('data'))));p.add_argument('--backup-root',help='Existing snapshot folder on a recovery drive')
    sub=p.add_subparsers(dest='action',required=True)
    sub.add_parser('list');sub.add_parser('backup')
    verify=sub.add_parser('verify');verify.add_argument('id')
    restore=sub.add_parser('restore');restore.add_argument('id');restore.add_argument('--out',required=True)
    replace=sub.add_parser('install');replace.add_argument('id');replace.add_argument('--database',required=True,choices=DATABASES)
    args=p.parse_args();vault=DataVault(args.data_dir)
    if args.backup_root:
        root=Path(args.backup_root).expanduser().resolve()
        if not root.is_dir():raise ValueError('Backup root does not exist')
        vault.root=root
    if args.action=='list':result=vault.status()
    elif args.action=='backup':result=vault.snapshot('manual')
    elif args.action=='verify':result=vault.verify(args.id)
    elif args.action=='restore':result={'restored_copy':str(vault.restore_copy(args.id,args.out))}
    else:result=install(vault,args.id,args.database)
    print(json.dumps(result,indent=2))

if __name__=='__main__':main()
