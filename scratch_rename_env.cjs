const fs = require('fs');
const path = require('path');

const replacements = [
  { from: /\bVITE_SUPABASE_URL\b/g, to: 'VITE_CUSTOM_SUPABASE_URL' },
  { from: /\bVITE_SUPABASE_PUBLISHABLE_KEY\b/g, to: 'VITE_CUSTOM_SUPABASE_ANON_KEY' },
  { from: /\bSUPABASE_URL\b/g, to: 'CUSTOM_SUPABASE_URL' },
  { from: /\bSUPABASE_PUBLISHABLE_KEY\b/g, to: 'CUSTOM_SUPABASE_ANON_KEY' },
  { from: /\bSUPABASE_SERVICE_ROLE_KEY\b/g, to: 'CUSTOM_SUPABASE_SERVICE_ROLE_KEY' }
];

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      if (!file.includes('node_modules') && !file.includes('.git') && !file.includes('.expo') && !file.includes('dist')) {
        results = results.concat(walk(file));
      }
    } else {
      const ext = path.extname(file);
      if (['.ts', '.tsx', '.js', '.jsx', '.env', '.production'].includes(ext) || file.endsWith('.env') || file.endsWith('.env.production')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk(process.cwd());
let changedFiles = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let newContent = content;

  // We need to apply replacements carefully.
  // Because 'VITE_SUPABASE_URL' contains 'SUPABASE_URL', word boundaries handle it!
  // BUT wait, VITE_SUPABASE_URL has word boundaries. If we replace it first, it becomes VITE_CUSTOM_SUPABASE_URL.
  // Then the next rule for SUPABASE_URL: does it match 'VITE_CUSTOM_SUPABASE_URL'?
  // 'VITE_CUSTOM_SUPABASE_URL' -> \bSUPABASE_URL\b -> 'SUPABASE_URL' has a word boundary before 'S' and after 'L'.
  // In 'VITE_CUSTOM_SUPABASE_URL', the character before 'S' is '_', which is a WORD character (\w).
  // So \b will NOT match between '_' and 'S'!
  // Let's verify: \b matches between \w and \W. '_' is \w. 'S' is \w. So there is NO \b between '_' and 'S'.
  // This means \bSUPABASE_URL\b will NOT match 'VITE_CUSTOM_SUPABASE_URL' or 'VITE_SUPABASE_URL'.
  // This is perfect!

  replacements.forEach(r => {
    newContent = newContent.replace(r.from, r.to);
  });

  if (newContent !== content) {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log(`Updated: ${file}`);
    changedFiles++;
  }
});

console.log(`Total files updated: ${changedFiles}`);
