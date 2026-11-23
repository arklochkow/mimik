/* eslint-disable no-console */

const DEV = import.meta.env.COMMAND === 'serve';

const STYLES = {
  debug: 'color:gray',
  info: 'color:green;font-weight:bold',
  warn: 'color:orange;font-weight:bold',
  error: 'color:red;font-weight:bold',
} as const;

type LogFn = (...args: unknown[]) => void;

function bind(level: 'log' | 'info' | 'warn' | 'error', style: string): LogFn {
  return console[level].bind(console, `%c mimik `, style);
}

const silent: LogFn = () => {};

export const logger = {
  debug: DEV ? bind('log', STYLES.debug) : silent,
  info: DEV ? bind('info', STYLES.info) : silent,
  warn: DEV ? bind('warn', STYLES.warn) : silent,
  error: bind('error', STYLES.error),
};
