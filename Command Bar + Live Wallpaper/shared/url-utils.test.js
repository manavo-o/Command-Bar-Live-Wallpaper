const assert = require('assert');
const urls = require('./url-utils.js');

assert.strictEqual(urls.normalize('https://WWW.Example.com/path/#section'), 'https://example.com/path');
assert.strictEqual(urls.normalize('not a url'), 'not a url');
assert.strictEqual(urls.isWebUrl('https://example.com'), true);
assert.strictEqual(urls.isWebUrl('dict://word'), false);
console.log('url utility tests passed');
