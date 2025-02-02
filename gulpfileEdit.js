/**
 * Copyright 2018-2024 bluefox <dogafox@gmail.com>
 *
 * MIT License
 *
 **/
'use strict';

const fs         = require('node:fs');
const rename     = require('gulp-rename');
const cp         = require('node:child_process');

const dir = `${__dirname}/src/src/i18n/`;

function deleteFoldersRecursive(path, exceptions) {
    if (fs.existsSync(path)) {
        const files = fs.readdirSync(path);
        for (const file of files) {
            const curPath = `${path}/${file}`;
            if (exceptions && exceptions.find(e => curPath.endsWith(e))) {
                continue;
            }

            const stat = fs.statSync(curPath);
            if (stat.isDirectory()) {
                deleteFoldersRecursive(curPath);
                fs.rmdirSync(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        }
    }
}

module.exports = function init(gulp) {
    gulp.task('[edit]i18n=>flat', done => {
        const files = fs.readdirSync(dir).filter(name => name.match(/\.json$/));
        const index = {};
        const langs = [];
        files.forEach(file => {
            const lang = file.replace(/\.json$/, '');
            langs.push(lang);
            const text = require(dir + file);

            for (const id in text) {
                if (text.hasOwnProperty(id)) {
                    index[id] = index[id] || {};
                    index[id][lang] = text[id] === undefined ? id : text[id];
                }
            }
        });

        const keys = Object.keys(index);
        keys.sort();

        if (!fs.existsSync(`${dir}/flat/`)) {
            fs.mkdirSync(`${dir}/flat/`);
        }

        langs.forEach(lang => {
            const words = [];
            keys.forEach(key => {
                words.push(index[key][lang]);
            });
            fs.writeFileSync(`${dir}/flat/${lang}.txt`, words.join('\n'));
        });
        fs.writeFileSync(`${dir}/flat/index.txt`, keys.join('\n'));
        done();
    });

    gulp.task('[edit]flat=>i18n', done => {
        if (!fs.existsSync(`${dir}/flat/`)) {
            console.error(`${dir}/flat/ directory not found`);
            return done();
        }
        const keys = fs.readFileSync(dir + '/flat/index.txt').toString().split(/[\r\n]/);
        while (!keys[keys.length - 1]) keys.splice(keys.length - 1, 1);

        const files = fs.readdirSync(dir + '/flat/').filter(name => name.match(/\.txt$/) && name !== 'index.txt');
        const index = {};
        const langs = [];
        files.forEach(file => {
            const lang = file.replace(/\.txt$/, '');
            langs.push(lang);
            const lines = fs.readFileSync(dir + '/flat/' + file).toString().split(/[\r\n]/);
            lines.forEach((word, i) => {
                index[keys[i]] = index[keys[i]] || {};
                index[keys[i]][lang] = word;
            });
        });
        langs.forEach(lang => {
            const words = {};
            keys.forEach((key, line) => {
                if (!index[key]) {
                    console.log(`No word ${key}, ${lang}, line: ${line}`);
                }
                words[key] = index[key][lang];
            });
            fs.writeFileSync(`${dir}/${lang}.json`, JSON.stringify(words, null, 2));
        });
        done();
    });

    gulp.task('[edit]clean', done => {
        deleteFoldersRecursive(`${__dirname}/admin`, ['chart']);
        deleteFoldersRecursive(`${__dirname}/src/build`);
        done();
    });

    function npmInstall() {
        return new Promise((resolve, reject) => {
            // Install node modules
            const cwd = `${__dirname.replace(/\\/g, '/')}/src/`;

            const cmd = `npm install -f`;
            console.log(`"${cmd} in ${cwd}`);

            // System call used for update of js-controller itself,
            // because during installation npm packet will be deleted too, but some files must be loaded even during the install process.
            const child = cp.exec(cmd, {cwd});

            child.stderr.pipe(process.stderr);
            child.stdout.pipe(process.stdout);

            child.on('exit', (code /* , signal */) => {
                // code 1 is strange error that cannot be explained. Everything is installed but error :(
                if (code && code !== 1) {
                    reject(`Cannot install: ${code}`);
                } else {
                    console.log(`"${cmd} in ${cwd} finished.`);
                    // command succeeded
                    resolve();
                }
            });
        });
    }

    gulp.task('[edit]2-npm', () => {
        if (fs.existsSync(`${__dirname}/src/node_modules`)) {
            return Promise.resolve();
        } else {
            return npmInstall();
        }
    });

    gulp.task('[edit]2-npm-dep', gulp.series('[edit]clean', '[edit]2-npm'));

    function build() {
        return new Promise((resolve, reject) => {
            const options = {
                stdio: 'pipe',
                cwd:   `${__dirname}/src/`
            };

            const version = JSON.parse(fs.readFileSync(`${__dirname}/package.json`).toString('utf8')).version;
            const data = JSON.parse(fs.readFileSync(`${__dirname}/src/package.json`).toString('utf8'));
            data.version = version;
            fs.writeFileSync(`${__dirname}/src/package.json`, JSON.stringify(data, null, 2));

            console.log(options.cwd);

            let script = `${__dirname}/src/node_modules/react-scripts/scripts/build.js`;
            if (!fs.existsSync(script)) {
                script = `${__dirname}/node_modules/react-scripts/scripts/build.js`;
            }
            if (!fs.existsSync(script)) {
                console.error(`Cannot find execution file: ${script}`);
                reject(`Cannot find execution file: ${script}`);
            } else {
                const child = cp.fork(script, [], options);
                child.stdout.on('data', data => console.log(data.toString()));
                child.stderr.on('data', data => console.log(data.toString()));
                child.on('close', code => {
                    console.log(`child process exited with code ${code}`);
                    code ? reject(`Exit code: ${code}`) : resolve();
                });
            }
        });
    }

    gulp.task('[edit]3-build', () => build());

    gulp.task('[edit]3-build-dep', gulp.series('[edit]2-npm', '[edit]3-build'));

    function copyFiles() {
        deleteFoldersRecursive(`${__dirname}/admin`, ['chart', 'preview']);

        return Promise.all([
            gulp.src([
                'src/build/**/*',
                '!src/build/index.html',
                '!src/build/static/js/main.*.chunk.js',
                '!src/build/static/media/*.svg',
                '!src/build/static/media/*.txt',
                '!src/build/i18n/**/*',
                '!src/build/i18n',
            ])
                .pipe(gulp.dest('admin/')),

            gulp.src([
                'admin-config/*',
            ])
                .pipe(gulp.dest('admin/')),

            gulp.src([
                'src/build/index.html',
            ])
                .pipe(rename('tab.html'))
                .pipe(gulp.dest('admin/')),

            gulp.src([
                'src/build/static/js/main.*.chunk.js',
            ])
                .pipe(gulp.dest('admin/static/js/')),
        ]);
    }

    gulp.task('[edit]5-copy', () => copyFiles());

    gulp.task('[edit]5-copy-dep', gulp.series('[edit]3-build-dep', '[edit]5-copy'));

    gulp.task('[edit]6-patch', () => new Promise(resolve => {
        if (fs.existsSync(`${__dirname}/admin/tab.html`)) {
            let code = fs.readFileSync(`${__dirname}/admin/tab.html`).toString('utf8');
            code = code.replace(/<script>var script=document\.createElement\("script"\).+?<\/script>/,
                `<script type="text/javascript" src="./../../lib/js/socket.io.js"></script>`);

            fs.writeFileSync(`${__dirname}/admin/tab.html`, code);
        }
        if (fs.existsSync(`${__dirname}/src/build/index.html`)) {
            let code = fs.readFileSync(`${__dirname}/src/build/index.html`).toString('utf8');
            code = code.replace(/<script>var script=document\.createElement\("script"\).+?<\/script>/,
                `<script type="text/javascript" src="./../../lib/js/socket.io.js"></script>`);

            fs.writeFileSync(`${__dirname}/src/build/index.html`, code);
        }
        resolve();
    }));

    gulp.task('[edit]6-patch-dep',  gulp.series('[edit]5-copy-dep', '[edit]6-patch'));
};
