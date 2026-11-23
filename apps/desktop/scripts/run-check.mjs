import { spawnSync } from 'node:child_process';

const target = process.argv[2];
const electron = spawnSync('node', ['-p', "require('electron')"], { encoding: 'utf8' }).stdout.trim();
const headless = process.platform === 'linux' && spawnSync('sh', ['-c', 'command -v xvfb-run']).status === 0;

const { status } = headless
  ? spawnSync('xvfb-run', ['-a', '-s', '-screen 0 1920x1080x24', electron, target], { stdio: 'inherit' })
  : spawnSync(electron, [target], { stdio: 'inherit' });

process.exit(status ?? 1);
