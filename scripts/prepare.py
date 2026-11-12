import json, pathlib, subprocess, shutil
root=pathlib.Path(__file__).resolve().parents[1]
m=json.loads((root/'manifest.json').read_text())
out=root/'checkout'
if out.exists(): raise SystemExit('checkout already exists; use a new checkout for a clean replay')
subprocess.run(['git','clone','--filter=blob:none',m['upstream']+'.git',str(out)],check=True)
subprocess.run(['git','-C',str(out),'checkout','--detach',m['baseline_commit']],check=True)
for p in sorted((root/'patches').glob('*.patch')):
 subprocess.run(['git','-C',str(out),'apply','--check',str(p)],check=True)
 subprocess.run(['git','-C',str(out),'apply',str(p)],check=True)
for p in (root/'overlay').rglob('*'):
 if p.is_file():
  dst=out/p.relative_to(root/'overlay');dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,dst)
print('Prepared',m['baseline_commit'],'with reviewed study changes')
