/**
 * scripts/verify-provenance.test.mjs
 *
 * Automated regression test suite for scripts/verify-provenance.mjs
 */

import assert from 'node:assert/strict';
import { parsePackageInput, hasValidAttestations, verifyPackageProvenance } from './verify-provenance.mjs';

async function runTests() {
  console.log('--- Running verify-provenance test suite ---');

  // Test 1: parsePackageInput with Changesets JSON array string
  {
    const input = ['[{"name":"@echomirror/core","version":"0.1.0"},{"name":"@echomirror/mood","version":"0.2.0"}]'];
    const parsed = parsePackageInput(input);
    assert.equal(parsed.length, 2);
    assert.deepEqual(parsed[0], { name: '@echomirror/core', version: '0.1.0' });
    assert.deepEqual(parsed[1], { name: '@echomirror/mood', version: '0.2.0' });
    console.log('✓ test_01_parse_changesets_json_string passed');
  }

  // Test 2: parsePackageInput with command-line arguments (package@version)
  {
    const input = ['@echomirror/core@1.0.0', '@echomirror/stellar@2.0.0', 'plain-pkg@0.0.1'];
    const parsed = parsePackageInput(input);
    assert.equal(parsed.length, 3);
    assert.deepEqual(parsed[0], { name: '@echomirror/core', version: '1.0.0' });
    assert.deepEqual(parsed[1], { name: '@echomirror/stellar', version: '2.0.0' });
    assert.deepEqual(parsed[2], { name: 'plain-pkg', version: '0.0.1' });
    console.log('✓ test_02_parse_cli_arguments passed');
  }

  // Test 3: parsePackageInput with empty or malformed inputs
  {
    assert.deepEqual(parsePackageInput([]), []);
    assert.deepEqual(parsePackageInput(null), []);
    assert.deepEqual(parsePackageInput(['']), []);
    assert.deepEqual(parsePackageInput(['   ']), []);
    console.log('✓ test_03_parse_empty_and_boundaries passed');
  }

  // Test 4: hasValidAttestations evaluation
  {
    const validAttestationJson = JSON.stringify({
      url: 'https://registry.npmjs.org/-/npm/v1/attestations/publint@0.3.24',
      provenance: {
        predicateType: 'https://slsa.dev/provenance/v1'
      }
    });
    assert.equal(hasValidAttestations(validAttestationJson), true);

    const validArrayJson = JSON.stringify([
      { predicateType: 'https://slsa.dev/provenance/v1' }
    ]);
    assert.equal(hasValidAttestations(validArrayJson), true);

    // Invalid / empty attestations
    assert.equal(hasValidAttestations(''), false);
    assert.equal(hasValidAttestations('   \n  '), false);
    assert.equal(hasValidAttestations('{}'), false);
    assert.equal(hasValidAttestations('[]'), false);
    assert.equal(hasValidAttestations('null'), false);
    assert.equal(hasValidAttestations('undefined'), false);
    console.log('✓ test_04_has_valid_attestations_checks passed');
  }

  // Test 5: verifyPackageProvenance with mocked successful executor
  {
    let callCount = 0;
    const mockExecutor = () => {
      callCount++;
      return JSON.stringify({
        url: 'https://registry.npmjs.org/-/npm/v1/attestations/test@1.0.0',
        provenance: { predicateType: 'https://slsa.dev/provenance/v1' }
      });
    };

    const res = await verifyPackageProvenance('test-pkg', '1.0.0', {
      maxRetries: 3,
      initialDelayMs: 10,
      executor: mockExecutor
    });
    assert.equal(res.ok, true);
    assert.equal(callCount, 1);
    console.log('✓ test_05_verify_success_mock passed');
  }

  // Test 6: verifyPackageProvenance with retries then success
  {
    let callCount = 0;
    const mockExecutor = () => {
      callCount++;
      if (callCount < 3) {
        return '';
      }
      return JSON.stringify({
        url: 'https://registry.npmjs.org/-/npm/v1/attestations/retry-pkg@1.0.0',
        provenance: {}
      });
    };

    const res = await verifyPackageProvenance('retry-pkg', '1.0.0', {
      maxRetries: 4,
      initialDelayMs: 10,
      backoffFactor: 1.0,
      executor: mockExecutor
    });
    assert.equal(res.ok, true);
    assert.equal(callCount, 3);
    console.log('✓ test_06_verify_retry_then_success_mock passed');
  }

  // Test 7: verifyPackageProvenance fails when attestations are missing after all retries
  {
    let callCount = 0;
    const mockExecutor = () => {
      callCount++;
      return '';
    };

    const res = await verifyPackageProvenance('unprovenanced-pkg', '1.0.0', {
      maxRetries: 3,
      initialDelayMs: 10,
      backoffFactor: 1.0,
      executor: mockExecutor
    });
    assert.equal(res.ok, false);
    assert.equal(callCount, 3);
    assert.match(res.error, /is published without attestations/);
    console.log('✓ test_07_verify_failure_when_empty_mock passed');
  }

  // Test 8: Live registry verification check against existing unprovenanced core@0.1.0
  {
    // The issue states: The 0.1.0 packages that were published by hand carry no attestations either
    // ("npm view @echomirror/core dist.attestations is empty").
    // The post-release check MUST fail on unprovenanced packages.
    const res = await verifyPackageProvenance('@echomirror/core', '0.1.0', {
      maxRetries: 1,
      initialDelayMs: 10
    });
    assert.equal(res.ok, false);
    assert.match(res.error, /dist\.attestations is empty/);
    console.log('✓ test_08_live_unprovenanced_package_fails_check passed');
  }

  // Test 9: Live registry verification check against known provenanced package (publint)
  {
    const res = await verifyPackageProvenance('publint', '0.3.24', {
      maxRetries: 1,
      initialDelayMs: 10
    });
    assert.equal(res.ok, true);
    console.log('✓ test_09_live_provenanced_package_passes_check passed');
  }

  console.log('\nAll 9 tests in verify-provenance.test.mjs passed successfully! (9/9 passed)');
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
