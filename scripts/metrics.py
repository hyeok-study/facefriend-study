"""Static, file-level dependency metrics. No runtime or coverage inference."""
import argparse,collections,hashlib,json,pathlib,re,subprocess
p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('--output',required=True);a=p.parse_args();root=pathlib.Path(a.source).resolve()
# Production files only; tests, generated output, vendor code and frontend assets excluded by name.
ext={'.java','.ts','.tsx','.js','.jsx'}; skip={'node_modules','.git','build','dist','coverage','test','tests','__tests__','generated','artillery'}
files={x.relative_to(root).as_posix():x for x in root.rglob('*') if x.is_file() and x.suffix in ext and not skip.intersection(x.relative_to(root).parts) and not re.search(r'\.(?:spec|test|d)\.[tj]sx?$',x.name)}
text={k:v.read_text(errors='replace') for k,v in files.items()};edges={k:set() for k in files}; unresolved=0
java={}
for k,s in text.items():
 m=re.search(r'\bpackage\s+([\w.]+)\s*;',s)
 if m:java[m[1]+'.'+pathlib.Path(k).stem]=k
for k,s in text.items():
 if k.endswith('.java'):
  for imp in re.findall(r'^\s*import\s+(?:static\s+)?([\w.]+)\s*;',s,re.M):
   target=java.get(imp) or java.get(imp.rsplit('.',1)[0])
   if target and target!=k:edges[k].add(target)
 else:
  imports=re.findall(r'(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*|\bimport\s*)[\'\"]([^\'\"]+)[\'\"]',s)
  for imp in imports:
   if not imp.startswith(('.', 'src/','@/')):continue
   candidates=[]
   if imp.startswith('.'):
    candidates.append((pathlib.PurePosixPath(k).parent/imp).as_posix())
   else:
    prefix='packages/backend/' if k.startswith('packages/backend/') else 'server/' if k.startswith('server/') else ''
    candidates.append(prefix+imp.replace('@/', 'src/'))
   target=None
   for cand in candidates:
    import posixpath
    cand=posixpath.normpath(cand)
    base=cand[:-3] if cand.endswith('.js') else cand
    opts=[cand]+[base+e for e in ext]+[base+'/index'+e for e in ext]
    target=next((c for c in opts if c in files),None)
    if target:break
   if target and target!=k:edges[k].add(target)
   elif not target:unresolved+=1
incoming=collections.Counter(t for ts in edges.values() for t in ts)
rows=[{'file':k,'fan_in':incoming[k],'fan_out':len(edges[k])} for k in files]
sloc=sum(sum(bool(line.strip()) for line in re.sub(r'/\*.*?\*/|//[^\n]*','',s,flags=re.S).splitlines()) for s in text.values())
# Tarjan SCC, retaining multi-file cycles only.
idx={};low={};stack=[];on=set();cycles=[]
def visit(v):
 idx[v]=low[v]=len(idx);stack.append(v);on.add(v)
 for w in edges[v]:
  if w not in idx:visit(w);low[v]=min(low[v],low[w])
  elif w in on:low[v]=min(low[v],idx[w])
 if low[v]==idx[v]:
  comp=[]
  while True:
   w=stack.pop();on.remove(w);comp.append(w)
   if w==v:break
  if len(comp)>1:cycles.append(sorted(comp))
for v in edges:
 if v not in idx:visit(v)
digest=hashlib.sha256()
for k in sorted(files):digest.update(k.encode()+b'\0'+files[k].read_bytes()+b'\0')
r={'definition':'Production source files; fan-in/out counts distinct statically resolved internal file imports, not runtime calls. Java wildcard imports, DI wiring, reflection and unresolved TS aliases are not resolved. Cycles cover this graph only. Source lines approximate nonblank noncomment lines, not a quality score.', 'source_sha256':digest.hexdigest(),'files':len(files),'approx_source_lines':sloc,'internal_edges':sum(map(len,edges.values())),'unresolved_local_imports':unresolved,'cycle_count':len(cycles),'cycles':cycles,'top_fan_in':sorted(rows,key=lambda x:(-x['fan_in'],x['file']))[:10],'top_fan_out':sorted(rows,key=lambda x:(-x['fan_out'],x['file']))[:10],'file_metrics':sorted(rows,key=lambda x:x['file'])}
pathlib.Path(a.output).write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:r[k] for k in ['files','approx_source_lines','internal_edges','unresolved_local_imports','cycle_count']}))
