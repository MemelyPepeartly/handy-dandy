const gulp = require('gulp');
const ts = require('gulp-typescript');
const through2 = require('through2');
const yaml = require('js-yaml');
const Datastore = require('nedb');
const fs = require('fs');
const path = require('path');
const mergeStream = require('merge-stream');
const os = require('os');

// Dynamic import for 'del' package
let del;

async function initializeDel() {
  del = (await import('del')).default;
}

// Initialize del before using it
initializeDel().catch(err => {
  console.error('Failed to initialize del:', err);
});

const project = ts.createProject('tsconfig.json');
const MODULE = JSON.parse(fs.readFileSync("src/module.json").toString());
const STATIC_FILES = ["src/module.json", "src/assets/**/*"];
const PACK_SRC = "src/packs";
const DIST_DIR = "dist";
const USER_HOME = os.homedir();
const FOUNDRY_DIR = path.join(USER_HOME, "AppData\\Local\\FoundryVTT\\Data\\modules\\handy-dandy");

gulp.task('compile', () => {
  compilePacks();
  return gulp.src('src/**/*.ts')
    .pipe(project())
    .pipe(gulp.dest('dist/'));
});

gulp.task('copy', async () => {
  return new Promise((resolve) => {
    gulp.src('README.md').pipe(gulp.dest("dist/"));
    gulp.src("src/module.json").pipe(gulp.dest('dist/'));
    gulp.src("src/scripts/**").pipe(gulp.dest('dist/scripts/'));
    gulp.src("src/styles/**").pipe(gulp.dest('dist/styles/'));
    gulp.src("src/assets/**").pipe(gulp.dest('dist/assets/'));
    resolve();
  });
});

gulp.task('clean-foundry', async () => {
  if (!del) {
    console.error('del is not initialized');
    return;
  }
  return del([`${FOUNDRY_DIR}/**`, `!${FOUNDRY_DIR}`]);
});

gulp.task('copy-to-foundry', () => {
  return gulp.src('dist/**/*')
    .pipe(gulp.dest(FOUNDRY_DIR));
});

function compilePacks() {
  const folders = fs.readdirSync(PACK_SRC).filter((file) => {
    return fs.statSync(path.join(PACK_SRC, file)).isDirectory();
  });

  const packs = folders.map((folder) => {
    const db = new Datastore({
      filename: path.resolve(__dirname, DIST_DIR, "packs", folder),
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
gulp.task('test-build', gulp.series('build', 'clean-foundry', 'copy-to-foundry'));