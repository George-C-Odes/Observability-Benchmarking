import { runSyncCli } from './versions/sync-common.mjs';
import { syncFrameworkVersions } from './versions/sync-framework-versions.mjs';

// Keep the command used by existing IntelliJ run configurations available.
runSyncCli(import.meta.url, syncFrameworkVersions, 'framework version files');
