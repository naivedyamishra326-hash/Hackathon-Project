const cedar = require('@cedar-policy/cedar-wasm/nodejs');

// Test the correct API shape
const policyText = 'permit(principal, action, resource);';

// Try isAuthorized with text-based policies
try {
  const r = cedar.isAuthorized({
    principal: { type: 'User', id: 'alice' },
    action: { type: 'Action', id: 'view' },
    resource: { type: 'Photo', id: '1' },
    context: {},
    policies: { staticPolicies: policyText, templates: {}, templateLinks: [] },
    entities: [],
  });
  console.log('isAuthorized result:', JSON.stringify(r, null, 2));
} catch (e) {
  console.log('isAuthorized error:', e.message);
}

// Try with different format
try {
  const r2 = cedar.isAuthorized({
    principal: 'User::"alice"',
    action: 'Action::"view"',
    resource: 'Photo::"1"',
    context: {},
    policies: { staticPolicies: policyText, templates: {}, templateLinks: [] },
    entities: [],
  });
  console.log('isAuthorized v2 result:', JSON.stringify(r2, null, 2));
} catch (e) {
  console.log('isAuthorized v2 error:', e.message);
}

// Try policyToJson
try {
  const j = cedar.policyToJson(policyText);
  console.log('policyToJson:', JSON.stringify(j, null, 2));
} catch (e) {
  console.log('policyToJson error:', e.message);
}

// Check version
console.log('Cedar version:', cedar.getCedarVersion());
