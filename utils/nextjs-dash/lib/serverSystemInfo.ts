import 'server-only';
import packageJson from '../package.json';
import { resolveServerNpmVersion, type ServerSystemInfo } from './systemInfo';

export function collectServerSystemInfo(): ServerSystemInfo {
  return {
    nodejs: process.version,
    npm: resolveServerNpmVersion({
      packageManager: packageJson.packageManager,
      npmUserAgent: process.env.npm_config_user_agent,
    }),
    nextjs: packageJson.dependencies.next,
    react: packageJson.dependencies.react,
    mui: packageJson.dependencies['@mui/material'],
    typescript: packageJson.devDependencies.typescript,
    platform: process.platform,
    arch: process.arch,
  };
}
