import pathlib,subprocess,tempfile,json,unittest
class DependencyMetricsTest(unittest.TestCase):
 def test_internal_edges_cycles_and_external_exclusion(self):
  with tempfile.TemporaryDirectory() as td:
   root=pathlib.Path(td);src=root/'src';src.mkdir()
   for name,code in {'A.java':'package fixture;\nimport fixture.B;\nclass A {}','B.java':'package fixture;\nimport fixture.A;\nclass B {}','x.ts':"import { y } from './y';\nimport fs from 'node:fs';",'y.ts':"import { x } from './x';"}.items():(src/name).write_text(code)
   (src/'test').mkdir();(src/'test/ignored.ts').write_text('test code')
   out=root/'result.json';subprocess.run(['python3',str(pathlib.Path(__file__).with_name('metrics.py')),str(src),'--output',str(out)],check=True,stdout=subprocess.DEVNULL)
   r=json.loads(out.read_text());self.assertEqual((r['files'],r['internal_edges'],r['cycle_count']),(4,4,2));self.assertTrue(all(x['fan_in']==1 and x['fan_out']==1 for x in r['file_metrics']))
if __name__=='__main__':unittest.main()
