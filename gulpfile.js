// Import necessary modules
import gulp from 'gulp';
import ts from 'gulp-typescript';
import merge from 'merge-stream';
import template from 'gulp-template';
import del from 'del';
import os from 'os';
import path from 'path';
import source from 'vinyl-source-stream';
import buffer from 'vinyl-buffer';
import browserify from 'browserify';
import tsify from 'tsify';

// Import package.json
import pkg from './package.json' assert { type: 'json' };

// Construct the universal appdata path
const appdataPath = path.join(os.homedir(), 'AppData', 'Local', 'FoundryVTT', 'Data', 'modules', 'handy-dandy');

// Define clean task
function clean() {
    return del(['dist/**', '!dist']);
}

// Define bundleJavaScript task
function bundleJavaScript() {
    return browserify({
            entries: 'src/init.ts', // Main TypeScript file
            debug: true
        })
        .plugin(tsify)
        .bundle()
        .pipe(source('bundle.js')) // Name of your bundled file
        .pipe(buffer())
        .pipe(gulp.dest('dist/scripts')); // Destination folder for bundle.js
}

// Define copyAssets task
function copyAssets() {
    return gulp.src('src/**/*.{png,jpg,gif,css}')
        .pipe(gulp.dest('dist'));
}

// Define copyHbs task
function copyHbs() {
    return gulp.src('src/templates/*.hbs')
        .pipe(gulp.dest('dist/templates'));
}

// Define processModuleJson task
function processModuleJson() {
    return gulp.src('./src/module.json')
        .pipe(template({
            id: pkg.name,
            title: 'Handy Dandy',
            version: pkg.version
        }))
        .pipe(gulp.dest('dist'));
}

// Define build task
export const build = gulp.series(clean, bundleJavaScript, copyAssets, copyHbs, processModuleJson);

// Define test task
export function test(done) {
    // First, run the build task
    build(() => {
        // After build is complete, clean the appdata directory
        del([`${appdataPath}/**`, `!${appdataPath}`]).then(() => {
            console.log(`Copying build to ${appdataPath}`);

            // Then, copy build to appdata directory
            gulp.src('./dist/**/*')
                .pipe(gulp.dest(appdataPath))
                .on('finish', done); // Signal completion when copying is done
        });
    });
}


// Export the test task
export const testTask = gulp.series(build, test);

// Default task
export default build;
