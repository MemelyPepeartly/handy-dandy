import gulp from 'gulp';
import ts from 'gulp-typescript';
import through2 from 'through2';
import yaml from 'js-yaml';
import Datastore from 'nedb';
import fs from 'fs';
import path from 'path';
import mergeStream from 'merge-stream';
import del from 'del';

const project = ts.createProject('tsconfig.json');
const MODULE = JSON.parse(fs.readFileSync("src/module.json").toString());
const STATIC_FILES = ["src/module.json", "src/assets/**/*"];
const PACK_SRC = "src/packs";
const DIST_DIR = "dist";
const FOUNDRY_DIR = "AppData\\Local\\FoundryVTT\\Data\\modules\\handy-dandy";




gulp.task('compile', () => {
  compilePacks();

  return gulp.src('src/**/*.ts')
    .pipe(project())
    .pipe(gulp.dest('dist/'));
});

gulp.task('copy', async () => {
  return new Promise<void>((resolve) => {
    gulp.src('README.md').pipe(gulp.dest("dist/"));
    gulp.src("src/module.json").pipe(gulp.dest('dist/'));
    gulp.src("src/lang/**").pipe(gulp.dest('dist/lang/'));
    gulp.src("src/scripts/**").pipe(gulp.dest('dist/scripts/'));
    gulp.src("src/styles/**").pipe(gulp.dest('dist/styles/'));
    gulp.src("src/assets/**").pipe(gulp.dest('dist/assets/'));
    resolve();
  });
});

// Local FoundryVTT testing tasks
gulp.task('clean-foundry', () => {
  return del([`${FOUNDRY_DIR}/**`, `!${FOUNDRY_DIR}`]);
});
gulp.task('copy-to-foundry', () => {
  return gulp.src('dist/**/*')
    .pipe(gulp.dest(FOUNDRY_DIR));
});


function compilePacks() {
  const folders = fs.readdirSync(PACK_SRC).filter((file: any) => {
    return fs.statSync(path.join(PACK_SRC, file)).isDirectory();
  });

  const packs = folders.map((folder: any) => {
    const db = new Datastore({
      filename: path.resolve(__dirname, DIST_DIR, "packs", `${folder}`),
      autoload: true
    });

    return gulp.src(path.join(PACK_SRC, folder, "**.json")).pipe(through2.obj((file: any, enc: any, cb: any) => {
      let json = yaml.loadAll(file.contents.toString());
      db.insert(json);
      cb(null, file);
    }));
  });

  return mergeStream(...packs);
}

gulp.task('build', gulp.parallel('compile', 'copy'));
gulp.task('test-build', gulp.series('build', 'clean-foundry', 'copy-to-foundry'));