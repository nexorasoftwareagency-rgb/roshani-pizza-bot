const fs = require('fs');
const path = 'c:/Prasant-Pizza-ERP/rider/style.css';
let content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');
if (lines[2350].trim() === '}' && lines[2349].trim() === '}') {
    console.log('Found extra brace at line 2351');
    lines.splice(2350, 1);
    fs.writeFileSync(path, lines.join('\n'), 'utf8');
    console.log('Fixed.');
} else {
    console.log('Brace not found at expected position. Line 2350 is: "' + lines[2349] + '", Line 2351 is: "' + lines[2350] + '"');
}
