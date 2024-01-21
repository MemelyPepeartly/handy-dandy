const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const buildCommand = 'npm run build';

// Get the user's home directory
const homeDir = os.homedir();
const moduleDir = path.join(homeDir, 'AppData\\Local\\FoundryVTT\\Data\\modules\\handy-dandy');

// Recursive function to copy files and directories
function copyRecursiveSync(src, dest) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();
    if (isDirectory) {
        fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(childItemName => {
            copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
        });
    } else {
        fs.copyFileSync(src, dest);
    }
}

// Function to copy files from dist to module directory
function copyFiles() {
    if (fs.existsSync(moduleDir)) {
        // Use fs.rm instead of fs.rmdir
        fs.rmSync(moduleDir, { recursive: true, force: true });
    }
    fs.mkdirSync(moduleDir, { recursive: true });

    const distDir = path.join(__dirname, '..', 'dist');
    
    copyRecursiveSync(distDir, moduleDir);
}

// Run the build command
exec(buildCommand, (error, stdout, stderr) => {
    if (error) {
        console.error(`Build error: ${error.message}`);
        return;
    }
    if (stderr) {
        console.error(`Build stderr: ${stderr}`);
        return;
    }
    console.log(`Build stdout:\n${stdout}`);

    // Copy files after build is successful
    copyFiles();
});
