import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CloudAvailabilityProvider,
  getCloudAvailability,
  useCloudAvailable,
  useRelayAvailable,
  type CloudAvailability,
} from './useCloudAvailability';

describe('getCloudAvailability', () => {
  it('has no cloud when /api/info reports no address', () => {
    expect(
      getCloudAvailability({
        shared_api_base: null,
        shared_relay_api_base: null,
      })
    ).toEqual({ cloud: false, relay: false });
    expect(getCloudAvailability({})).toEqual({ cloud: false, relay: false });
  });

  it('treats an empty or blank address as not configured', () => {
    expect(
      getCloudAvailability({
        shared_api_base: '  ',
        shared_relay_api_base: 'http://localhost:8082',
      })
    ).toEqual({ cloud: false, relay: false });
  });

  it('has a cloud but no relay when only the API address is set', () => {
    expect(
      getCloudAvailability({
        shared_api_base: 'http://localhost:3000',
        shared_relay_api_base: null,
      })
    ).toEqual({ cloud: true, relay: false });
  });

  it('has both when a self-hoster sets both addresses', () => {
    expect(
      getCloudAvailability({
        shared_api_base: 'http://localhost:3000',
        shared_relay_api_base: 'http://localhost:8082',
      })
    ).toEqual({ cloud: true, relay: true });
  });
});

function Probe() {
  return (
    <span>{`cloud=${useCloudAvailable()} relay=${useRelayAvailable()}`}</span>
  );
}

function render(value?: CloudAvailability) {
  return renderToStaticMarkup(
    value ? (
      <CloudAvailabilityProvider value={value}>
        <Probe />
      </CloudAvailabilityProvider>
    ) : (
      <Probe />
    )
  );
}

describe('useCloudAvailable', () => {
  it('reports no cloud without a provider', () => {
    expect(render()).toContain('cloud=false relay=false');
  });

  it('reads the provided availability', () => {
    expect(render({ cloud: true, relay: false })).toContain(
      'cloud=true relay=false'
    );
    expect(render({ cloud: true, relay: true })).toContain(
      'cloud=true relay=true'
    );
  });
});
