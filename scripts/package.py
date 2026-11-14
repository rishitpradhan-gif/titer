from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path(__file__).resolve().parents[1]
paths = sorted(p for p in root.rglob('*') if p.is_file()
    and not any(part in {'.git', '.vercel', '.titer', 'node_modules', '__pycache__'} for part in p.relative_to(root).parts)
    and not p.name.startswith('.env') and p.name != '.DS_Store' and p.suffix != '.zip')
with ZipFile(root / 'public/titer-source.zip', 'w', ZIP_DEFLATED) as archive:
    for path in paths:
        archive.write(path, Path('titer') / path.relative_to(root))
print(f'Packaged {len(paths)} source files; credentials and generated archives excluded.')
