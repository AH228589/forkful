// Builds and signs the Forkful Android app (a Trusted Web Activity wrapping forkful-pink.vercel.app).
// Run from anywhere:  node android\build-apk.mjs
// Needs the JDK and Android SDK in %USERPROFILE%\.bubblewrap, plus keystore.local.json and
// forkful-release.keystore next to this file. Output: public\forkful.apk (served at /forkful.apk).
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const tools = path.join(os.homedir(), '.bubblewrap')
const sdk = path.join(tools, 'android_sdk')
const env = { ...process.env, JAVA_HOME: path.join(tools, 'jdk'), ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk }

function run(label, file, args) {
  console.log(`\n> ${label}`)
  const r = spawnSync('cmd.exe', ['/d', '/s', '/c', `"${[file, ...args].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}"`], { cwd: here, env, stdio: 'inherit', windowsVerbatimArguments: true })
  if (r.status !== 0) {
    console.error(`\n${label} failed (exit ${r.status}).`)
    process.exit(1)
  }
}

const keys = JSON.parse(fs.readFileSync(path.join(here, 'keystore.local.json'), 'utf8'))
const buildTools = fs
  .readdirSync(path.join(sdk, 'build-tools'))
  .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0]
const bt = path.join(sdk, 'build-tools', buildTools)
const unsigned = path.join(here, 'app', 'build', 'outputs', 'apk', 'release', 'app-release-unsigned.apk')
const aligned = path.join(here, 'app-release-aligned.apk')
const out = path.join(here, '..', 'public', 'forkful.apk')

fs.writeFileSync(path.join(here, 'local.properties'), `sdk.dir=${sdk.replace(/\\/g, '/')}\n`)
run('Building the app with Gradle (the first run downloads Gradle, a few minutes)', path.join(here, 'gradlew.bat'), ['assembleRelease', '--no-daemon'])
run('Aligning', path.join(bt, 'zipalign.exe'), ['-f', '-p', '4', unsigned, aligned])
run('Signing', path.join(bt, 'apksigner.bat'), ['sign', '--ks', path.join(here, 'forkful-release.keystore'), '--ks-key-alias', keys.alias, '--ks-pass', `pass:${keys.keystorePassword}`, '--key-pass', `pass:${keys.keyPassword}`, '--out', out, aligned])
run('Verifying the signature', path.join(bt, 'apksigner.bat'), ['verify', out])
fs.rmSync(aligned, { force: true })
console.log(`\nDone: ${out} (${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB)`)
