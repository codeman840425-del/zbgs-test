function browserConfigArgs(args) {
  const option = '--browser-config';
  const index = args.indexOf(option);
  if (index === -1) return {remaining: args, launchOptions: {channel: 'chrome'}};
  const browserConfig = args[index + 1];
  if (!browserConfig || browserConfig.startsWith('--') || args.includes(option, index + 2))
    throw Error('Expected one --browser-config PATH');
  return {remaining: [...args.slice(0, index), ...args.slice(index + 2)], launchOptions: {browserConfig}};
}

module.exports = {browserConfigArgs};
