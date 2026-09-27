"""Traversal regression: node/depth are one record, including appended children.
These tests cover the local traversal contract; they do not execute Pine.
"""
from dataclasses import dataclass
from pathlib import Path
import unittest

@dataclass(frozen=True)
class Task:
    node:int
    depth:int

def traverse(roots,children,layers,alternate=False):
    queue=[Task(node,0) for node in roots]
    emitted=[]; at=0
    while at<len(queue):
        entry=queue[at]
        emitted.append(entry)
        if entry.depth+1<layers and not alternate:
            queue.extend(Task(child,entry.depth+1) for child in children.get(entry.node,[]) if child>=0)
        at+=1
    return emitted

class RenderQueue(unittest.TestCase):
    def test_seventh_entry_after_six_roots_keeps_its_depth(self):
        output=traverse(list(range(6)),{0:[6,7],6:[8]},3)
        self.assertEqual(output[6],Task(6,1))
        self.assertEqual(output[-1],Task(8,2))
        self.assertEqual(len(output),9)
    def test_depth_filter_preserves_whole_parent_history(self):
        roots=list(range(100))
        output=traverse(roots,{i:[i+100] for i in roots},1)
        self.assertEqual([p.node for p in output],roots)
        self.assertTrue(all(p.depth==0 for p in output))
    def test_empty_and_unresolved_children(self):
        self.assertEqual(traverse([],{},8),[])
        self.assertEqual(traverse([0],{0:[-1,1,-1]},2),[Task(0,0),Task(1,1)])
    def test_alternate_stays_at_root(self):
        self.assertEqual(traverse([0],{0:[1]},8,True),[Task(0,0)])
    def test_pine_queue_entries_are_atomic_and_return_ids_separately(self):
        s=(Path(__file__).parents[1]/'Batty-Elliot-Wave.pine').read_text()
        body=s[s.index('f_drawHistory('):s.index('\nf_drawTree(')]
        self.assertIn('array<DrawTask> queue',body)
        self.assertIn('DrawTask task = array.get(queue, at)',body)
        self.assertNotIn('array.get(depths',body)
        pushes=[line.strip() for line in body.splitlines() if 'array.push(queue,' in line]
        self.assertEqual(len(pushes),3)
        self.assertTrue(all('DrawTask.new(' in line for line in pushes))
        self.assertTrue(body.rstrip().endswith('selectedIds'))

if __name__=='__main__':unittest.main()
