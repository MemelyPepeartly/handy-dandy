const { execSync } = require('child_process');

try {
  // Get the difference in package.json between the last two commits
  const diff = execSync('git diff HEAD~1..HEAD -- package.json').toString();

  // Check if the version field is in the diff
  if (diff.includes('"version":')) {
    console.log('Version has changed.');
    process.exit(0); // Exit with a zero status code to indicate version has changed
  } else {
    console.log('Version has not changed.');
    process.exit(1); // Exit with a non-zero status code to indicate version has not changed
  }
} catch (error) {
  console.error('Error checking version:', error);
  process.exit(1); // Exit with a non-zero status code on error
}
