const gulp = require('gulp');
const ts = require('gulp-typescript');
const merge = require('merge-stream');
const template = require('gulp-template');
const del = require('del');
const os = require('os');
const path = require('path');

// Import package.json
const pkg = require('./package.json');

// Initialize TypeScript project
const tsProject = ts.createProject('tsconfig.json');

// Construct the universal appdata path
const appdataPath = path.join(os.homedir(), 'AppData', 'Local', 'FoundryVTT', 'Data', 'modules', 'handy-dandy');

gulp.task('build', (done) => {
    // Clean the build directory
    del.sync(['build/**', '!build']);

    // Compile TypeScript files
    const tsResult = gulp.src('src/**/*.ts')
        .pipe(tsProject());

    // Write compiled JS to build directory
    const js = tsResult.js.pipe(gulp.dest('build'));

    // Copy assets
    const assets = gulp.src('src/**/*.{png,jpg,gif,css}')
        .pipe(gulp.dest('build'));

    // After TS and assets are processed, process module.json
    function processModuleJson() {
        return gulp.src('./src/module.json')
            .pipe(template({
                id: pkg.name, // Get project name from package.json
                title: 'Handy Dandy', // Update with your project's label
                version: pkg.version, // Get version from package.json
            }))
            .pipe(gulp.dest('build'));
    }

    // Use merge to handle multiple streams and call done when all streams are finished
    merge(js, assets)
        .on('finish', () => {
            processModuleJson().on('end', done);
        });
});



// Deploy build to appdata directory
gulp.task('test', (done) => {
    // Correctly call the build task and wait for its completion
    gulp.series('build')((err) => {
        if (err) return done(err); // If an error occurs in the build task, forward the error

        // Clean the appdata directory
        del.sync([`${appdataPath}/**`, `!${appdataPath}`]);

        console.log(`Copying build to ${appdataPath}`);

        // Copy build to appdata directory
        gulp.src('./build/**/*')
            .pipe(gulp.dest(appdataPath))
            .on('end', done); // Signal the end of the test task when copy is done
    });
});


// Default task
gulp.task('default', gulp.series('build'));