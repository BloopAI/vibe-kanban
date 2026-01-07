Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const core = require('@sentry/core');
const debugBuild = require('../debug-build.js');
const startProfileForSpan = require('./startProfileForSpan.js');
const utils = require('./utils.js');

const INTEGRATION_NAME = 'BrowserProfiling';

const _browserProfilingIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setup(client) {
      const activeSpan = core.getActiveSpan();
      const rootSpan = activeSpan && core.getRootSpan(activeSpan);

      if (rootSpan && utils.isAutomatedPageLoadSpan(rootSpan)) {
        if (utils.shouldProfileSpan(rootSpan)) {
          startProfileForSpan.startProfileForSpan(rootSpan);
        }
      }

      client.on('spanStart', (span) => {
        if (span === core.getRootSpan(span) && utils.shouldProfileSpan(span)) {
          startProfileForSpan.startProfileForSpan(span);
        }
      });

      client.on('beforeEnvelope', (envelope) => {
        // if not profiles are in queue, there is nothing to add to the envelope.
        if (!utils.getActiveProfilesCount()) {
          return;
        }

        const profiledTransactionEvents = utils.findProfiledTransactionsFromEnvelope(envelope);
        if (!profiledTransactionEvents.length) {
          return;
        }

        const profilesToAddToEnvelope = [];

        for (const profiledTransaction of profiledTransactionEvents) {
          const context = profiledTransaction?.contexts;
          const profile_id = context?.profile?.['profile_id'];
          const start_timestamp = context?.profile?.['start_timestamp'];

          if (typeof profile_id !== 'string') {
            debugBuild.DEBUG_BUILD && core.debug.log('[Profiling] cannot find profile for a span without a profile context');
            continue;
          }

          if (!profile_id) {
            debugBuild.DEBUG_BUILD && core.debug.log('[Profiling] cannot find profile for a span without a profile context');
            continue;
          }

          // Remove the profile from the span context before sending, relay will take care of the rest.
          if (context?.profile) {
            delete context.profile;
          }

          const profile = utils.takeProfileFromGlobalCache(profile_id);
          if (!profile) {
            debugBuild.DEBUG_BUILD && core.debug.log(`[Profiling] Could not retrieve profile for span: ${profile_id}`);
            continue;
          }

          const profileEvent = utils.createProfilingEvent(
            profile_id,
            start_timestamp ,
            profile,
            profiledTransaction ,
          );
          if (profileEvent) {
            profilesToAddToEnvelope.push(profileEvent);
          }
        }

        utils.addProfilesToEnvelope(envelope , profilesToAddToEnvelope);
      });
    },
  };
}) ;

const browserProfilingIntegration = core.defineIntegration(_browserProfilingIntegration);

exports.browserProfilingIntegration = browserProfilingIntegration;
//# sourceMappingURL=integration.js.map
