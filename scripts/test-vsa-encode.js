const radius = require('radius');

(function main(){
  const request = radius.encode({
    code: 'Access-Request',
    identifier: 0,
    secret: 's',
    attributes: [ ['User-Name','u'] ]
  });
  const decoded = radius.decode({ packet: request, secret: 's' });
  const MIKROTIK_VENDOR_ID = 14988;
  function vsa(typeCode, value){
    const buf = Buffer.from(String(value), 'utf8');
    const v = Buffer.alloc(6+buf.length);
    v.writeUInt32BE(MIKROTIK_VENDOR_ID,0);
    v.writeUInt8(typeCode,4);
    v.writeUInt8(2+buf.length,5);
    buf.copy(v,6);
    return v;
  }
  const attrs = {
    'Service-Type':'Framed-User',
    'Framed-Protocol':'PPP',
    'Vendor-Specific': [ vsa(2,'UpTo-10M'), vsa(8,'10M/10M') ]
  };
  const resp = radius.encode_response({ packet: decoded, code: 'Access-Accept', secret: 's', attributes: attrs });
  console.log('Encoded response length:', resp.length);
  console.log('OK');
})();
