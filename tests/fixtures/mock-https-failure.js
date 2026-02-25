/**
 * Mock https module to simulate network failures
 * Use via NODE_OPTIONS=--require tests/fixtures/mock-https-failure.js
 */

const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
  if (id === 'https') {
    const https = originalRequire.apply(this, arguments);
    
    // Override get to always fail
    const originalGet = https.get;
    https.get = function(url, options, callback) {
      const req = new (require('events'))();
      const res = new (require('events'))();
      
      // Simulate immediate error
      process.nextTick(() => {
        const error = new Error('MOCK_NETWORK_FAILURE: Simulated network error for testing');
        error.code = 'ENETUNREACH';
        req.emit('error', error);
      });
      
      return req;
    };
    
    return https;
  }
  return originalRequire.apply(this, arguments);
};
