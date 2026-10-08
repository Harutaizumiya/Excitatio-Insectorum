function requireOrigin(name, protocol) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set before building the mini-program.`);
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute ${protocol.slice(0, -1).toUpperCase()} URL.`);
  }
  if (url.protocol !== protocol) {
    throw new Error(`${name} must use ${protocol} for production builds.`);
  }
  return url;
}

const apiOrigin = requireOrigin('TARO_APP_API_ORIGIN', 'https:');
if (!apiOrigin.pathname.replace(/\/$/, '').endsWith('/api/v1')) {
  throw new Error('TARO_APP_API_ORIGIN must end in /api/v1.');
}

if (process.env.TARO_APP_SOCKET_ORIGIN) {
  requireOrigin('TARO_APP_SOCKET_ORIGIN', 'wss:');
}
