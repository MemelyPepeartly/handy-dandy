const gulp = require('gulp');
const ts = require('gulp-typescript');
const through2 = require('through2');
const yaml = require('js-yaml');
const Datastore = require('nedb');
const fs = require('fs');
const path = require('path');
const mergeStream = require('merge-stream');

const project = ts.createProject('tsconfig.json');
const MODULE = JSON.parse(fs.readFileSync("src/module.json").toString());
const STATIC_FILES = ["src/module.json", "src/assets/**/*"];
const PACK_SRC = "src/packs";
const DIST_DIR = "dist";

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

function compilePacks() {
  const folders = fs.readdirSync(PACK_SRC).filter((file) => {
    return fs.statSync(path.join(PACK_SRC, file)).isDirectory();
  });

  const packs = folders.map((folder) => {
    const db = new Datastore({
      filename: path.resolve(__dirname, DIST_DIR, "packs", `${folder}`),
      autoload: true
    });

    return gulp.src(path.join(PACK_SRC, folder, "**.json")).pipe(through2.obj((file, enc, cb) => {
      let json = yaml.loadAll(file.contents.toString());
      db.insert(json);
      cb(null, file);
    }));
  });

  return mergeStream(...packs);
}

gulp.task('build', gulp.parallel('compile', 'copy'));
