"""macOS login Keychain storage. No shell, plaintext files, or secret arguments."""
import ctypes as C
from contextlib import contextmanager
import os
import sys

SERVICE='com.the-desk.typesafe.jev'
ACCOUNT='api-key'

class KeychainError(ValueError):
    pass

class MacKeychain:
    def __init__(self,service=SERVICE,account=ACCOUNT):
        if sys.platform!='darwin' or os.environ.get('DESK_JEV_KEYCHAIN')=='disabled':
            raise KeychainError('Secure Jev storage requires macOS Keychain on this computer.')
        self.service=service;self.account=account
        self.cf=C.CDLL('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')
        self.sec=C.CDLL('/System/Library/Frameworks/Security.framework/Security')
        specs={
            'CFStringCreateWithCString':([C.c_void_p,C.c_char_p,C.c_uint32],C.c_void_p),
            'CFDataCreate':([C.c_void_p,C.c_void_p,C.c_long],C.c_void_p),
            'CFDataGetLength':([C.c_void_p],C.c_long),
            'CFDataGetBytePtr':([C.c_void_p],C.c_void_p),
            'CFDictionaryCreateMutable':([C.c_void_p,C.c_long,C.c_void_p,C.c_void_p],C.c_void_p),
            'CFDictionarySetValue':([C.c_void_p,C.c_void_p,C.c_void_p],None),
            'CFRelease':([C.c_void_p],None)}
        for name,(args,result) in specs.items():
            fn=getattr(self.cf,name);fn.argtypes=args;fn.restype=result
        for name,args in {'SecItemCopyMatching':[C.c_void_p,C.POINTER(C.c_void_p)],
                          'SecItemAdd':[C.c_void_p,C.c_void_p],
                          'SecItemUpdate':[C.c_void_p,C.c_void_p],
                          'SecItemDelete':[C.c_void_p]}.items():
            fn=getattr(self.sec,name);fn.argtypes=args;fn.restype=C.c_int32

    def const(self,name):
        return C.c_void_p.in_dll(self.cf if name.startswith('kCF') else self.sec,name).value

    @contextmanager
    def dictionary(self,fields):
        refs=[];d=self.cf.CFDictionaryCreateMutable(None,0,None,None)
        if not d:raise KeychainError('macOS Keychain could not allocate a request.')
        try:
            for name,value in fields.items():
                if isinstance(value,str):
                    v=self.cf.CFStringCreateWithCString(None,value.encode(),0x08000100);refs.append(v)
                elif isinstance(value,bytes):
                    v=self.cf.CFDataCreate(None,C.c_char_p(value),len(value));refs.append(v)
                else:v=value
                if not v:raise KeychainError('macOS Keychain could not encode the request.')
                self.cf.CFDictionarySetValue(d,self.const(name),v)
            yield d
        finally:
            self.cf.CFRelease(d)
            for ref in refs:
                if ref:self.cf.CFRelease(ref)

    def query(self,prompt=False):
        q={'kSecClass':self.const('kSecClassGenericPassword'),
           'kSecAttrService':self.service,'kSecAttrAccount':self.account,
           'kSecAttrSynchronizable':self.const('kCFBooleanFalse')}
        if not prompt:q['kSecUseAuthenticationUI']=self.const('kSecUseAuthenticationUIFail')
        return q

    @staticmethod
    def check(code):
        if code:
            if code in (-25308,-25293,-128):
                raise KeychainError('Keychain access was locked or denied. Unlock your login Keychain and choose Load saved key.')
            raise KeychainError('macOS Keychain operation failed (status '+str(code)+'). No plaintext fallback was used.')

    def load(self,prompt=False):
        q={**self.query(prompt),'kSecReturnData':self.const('kCFBooleanTrue'),
           'kSecMatchLimit':self.const('kSecMatchLimitOne')}
        out=C.c_void_p()
        with self.dictionary(q) as query:code=self.sec.SecItemCopyMatching(query,C.byref(out))
        if code==-25300:return ''
        try:
            self.check(code)
            if not out.value:raise KeychainError('macOS Keychain returned no credential data.')
            return C.string_at(self.cf.CFDataGetBytePtr(out),self.cf.CFDataGetLength(out)).decode('utf-8')
        finally:
            if out.value:self.cf.CFRelease(out)

    def save(self,key):
        # Update first avoids deleting the working credential if replacement fails.
        with self.dictionary(self.query(True)) as query,self.dictionary({'kSecValueData':key.encode()}) as update:
            code=self.sec.SecItemUpdate(query,update)
        if code==-25300:
            with self.dictionary({**self.query(True),'kSecValueData':key.encode(),
                                  'kSecAttrLabel':'The Desk · TypeSafe Jev API key'}) as item:
                code=self.sec.SecItemAdd(item,None)
        self.check(code)

    def delete(self):
        with self.dictionary(self.query(True)) as query:code=self.sec.SecItemDelete(query)
        if code!=-25300:self.check(code)
