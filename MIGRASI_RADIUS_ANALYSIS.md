# Analisis Migrasi Node.js RADIUS ke FreeRADIUS

## Executive Summary

Aplikasi kilusi-bill saat ini menggunakan implementasi RADIUS custom dengan Node.js. Migrasi ke FreeRADIUS memiliki keuntungan dan tantangan yang perlu dipertimbangkan dengan matang.

## 1. Analisis Implementasi RADIUS Saat Ini (Node.js)

### 1.1 Arsitektur Current
- **Server RADIUS**: Custom Node.js menggunakan library `radius` v1.1.4
- **Database**: PostgreSQL dengan schema RADIUS standar (radcheck, radreply, radgroup, dll)
- **Protokol**: UDP pada port 1812 (auth) dan 1813 (accounting)
- **Authentication**: PAP dan CHAP (MS-CHAP tidak diimplementasi)
- **Vendor Specific Attributes (VSA)**: Mikrotik (Vendor ID: 14988)

### 1.2 Fitur yang Diimplementasikan

#### Core RADIUS Features:
- ✅ Access-Request/Response (PAP, CHAP)
- ✅ Accounting-Request/Response (Start, Interim-Update, Stop)
- ✅ NAS Client Management
- ✅ User Authentication (PostgreSQL backend)
- ✅ Group-based Authorization
- ✅ Reply Attributes (user & group level)

#### Advanced Features:
- ✅ Mikrotik Vendor-Specific Attributes (VSA)
  - Mikrotik-Group (type 2)
  - Mikrotik-Rate-Limit (type 8)
  - Mikrotik-Recv-Limit (type 9)
  - Mikrotik-Xmit-Limit (type 10)
- ✅ Dynamic PPPoE Profile Assignment
- ✅ Session Management & Cleanup
- ✅ Real-time Session Monitoring
- ✅ Ghost Session Detection & Cleanup
- ✅ Integration dengan Billing System

#### Integration Features:
- ✅ PostgreSQL Database Integration
- ✅ Customer Billing Integration
- ✅ Package-based Profile Assignment
- ✅ WhatsApp Notifications
- ✅ Web Dashboard Management
- ✅ API Endpoints untuk Management

### 1.3 Database Schema
```sql
-- Tables utama RADIUS
radcheck          -- User authentication (password)
radreply          -- User-specific reply attributes
radgroup          -- Group definitions
radgroupcheck     -- Group check attributes
radgroupreply     -- Group reply attributes
radusergroup      -- User-to-group mapping
radacct           -- Accounting records
nas_servers       -- NAS client configuration
```

## 2. Identifikasi Fitur RADIUS yang Digunakan

### 2.1 Authentication Methods
```javascript
// PAP (Password Authentication Protocol)
if (attrs['User-Password']) {
  // Direct password comparison
}

// CHAP (Challenge Handshake Authentication Protocol)
if (attrs['CHAP-Password'] && attrs['CHAP-Challenge']) {
  // MD5 hash verification
}
```

### 2.2 Reply Attributes
- **Standard RADIUS Attributes**:
  - Service-Type: Framed-User
  - Framed-Protocol: PPP
  - Reply-Message: Custom messages
  - Framed-Pool: IP address pools

- **Mikrotik VSAs**:
  - Mikrotik-Group: PPPoE profile assignment
  - Mikrotik-Rate-Limit: Bandwidth control
  - Mikrotik-Recv-Limit: Download limit
  - Mikrotik-Xmit-Limit: Upload limit

### 2.3 Accounting Features
- Session tracking dengan unique IDs
- Start/Stop/Interim-Update records
- Bandwidth usage tracking
- Session duration calculation
- Automatic cleanup of stale sessions

## 3. Analisis Kebutuhan FreeRADIUS

### 3.1 FreeRADIUS Components yang Diperlukan
1. **freeradius**: Core server
2. **freeradius-postgresql**: PostgreSQL module
3. **freeradius-utils**: Administration utilities
4. **freeradius-mikrotik**: Mikrotik dictionary (jika tersedia)

### 3.2 Konfigurasi yang Diperlukan

#### mods-available/sql (PostgreSQL)
```sql
# Connection settings
sql {
    driver = "rlm_sql_postgresql"
    server = "localhost"
    login = "radius"
    password = "radius_password"
    radius_db = "billing_db"

    # Table mappings
    acct_table1 = "radacct"
    acct_table2 = "radacct"
    nas_table = "nas_servers"
    ...
}
```

#### mods-available/mikrotik (Custom Dictionary)
```
# Mikrotik Vendor Dictionary
VENDOR  Mikrotik        14988

BEGIN-VENDOR  Mikrotik
ATTRIBUTE    Mikrotik-Group          2   string
ATTRIBUTE    Mikrotik-Rate-Limit     8   string
ATTRIBUTE    Mikrotik-Recv-Limit     9   string
ATTRIBUTE    Mikrotik-Xmit-Limit     10  string
END-VENDOR    Mikrotik
```

### 3.3 Policy Configuration
- **default site**: Untuk processing requests
- **inner-tunnel**: Untuk PEAP/TTLS (jika diperlukan)
- **policy.d/**: Custom policies untuk integration

## 4. Perbandingan Node.js vs FreeRADIUS

### 4.1 Performance & Scalability

| Aspect | Node.js RADIUS | FreeRADIUS |
|--------|----------------|------------|
| **Performance** | Moderate (single-threaded) | High (multi-threaded, optimized) |
| **Concurrency** | Event loop (single thread) | Multi-threaded, async I/O |
| **Memory Usage** | ~50-100MB | ~20-50MB |
| **Max Requests/sec** | ~500-1000 RPS | ~5000-10000 RPS |
| **Connection Handling** | UDP per port | Optimized UDP handling |

### 4.2 Features & Flexibility

| Feature | Node.js | FreeRADIUS |
|---------|---------|------------|
| **EAP Methods** | Limited (PAP, CHAP only) | Full support (PEAP, EAP-TTLS, EAP-TLS) |
| **Custom Attributes** | Easy (JavaScript) | Configuration files |
| **Dynamic Configuration** | Runtime changes | Requires restart/reload |
| **Integration** | Native with app | External API needed |
| **Debugging** | Console logs | Detailed debug mode |
| **Modules** | npm packages | Built-in modules |

### 4.3 Maintenance & Operations

| Aspect | Node.js | FreeRADIUS |
|--------|---------|------------|
| **Configuration** | JavaScript code | Text files (complex syntax) |
| **Monitoring** | Custom implementation | Built-in monitoring tools |
| **Troubleshooting** | Console output | Debug mode, radtest, radmin |
| **Updates** | npm update | Package manager updates |
| **Community** | Large Node.js community | RADIUS-specific community |

### 4.4 Security

| Feature | Node.js | FreeRADIUS |
|---------|---------|------------|
| **Security Track Record** | Depends on implementation | Mature, battle-tested |
| **CVE History** | Node.js vulnerabilities | Well-documented |
| **Certificate Handling** | Limited | Full X.509 support |
| **Protocol Compliance** | Basic implementation | RFC compliant |

## 5. Tantangan Migrasi

### 5.1 Technical Challenges

#### 5.1.1 Custom Business Logic
- **Dynamic PPPoE Profile Assignment**: Currently integrated with billing database
- **Package-based Attribute Mapping**: Needs conversion to SQL-based policies
- **Real-time Session Monitoring**: Requires separate monitoring solution

#### 5.1.2 Integration Points
- **Web Dashboard**: API calls needed instead of direct module access
- **Customer Management**: Database triggers or API synchronization
- **WhatsApp Notifications**: External triggers needed
- **Billing Integration**: Periodic sync or real-time API

#### 5.1.3 Mikrotik VSAs
- **Custom Dictionary**: Need to create Mikrotik dictionary file
- **Attribute Encoding**: FreeRADIUS handles VSA differently
- **Profile Mapping**: Convert JavaScript logic to unlang policies

### 5.2 Operational Challenges

#### 5.2.1 Configuration Complexity
- **Learning Curve**: FreeRADIUS configuration syntax is complex
- **Debugging**: Different debugging methodology
- **Testing**: Need radtest, radeapclient for testing

#### 5.2.2 Monitoring & Maintenance
- **Session Monitoring**: Need separate solution (radwho, sql queries)
- **Performance Monitoring**: Need external tools
- **Log Analysis**: Different log format and location

#### 5.2.3 Migration Strategy
- **Zero Downtime**: Need parallel running period
- **Data Migration**: Database compatibility (mostly compatible)
- **Rollback Plan**: Quick fallback to Node.js version

## 6. Solusi dan Rekomendasi

### 6.1 Hybrid Approach (Recommended)

#### Phase 1: Gradual Migration
1. **Authentication**: Migrate to FreeRADIUS first
2. **Accounting**: Keep Node.js for custom logic
3. **Management**: Maintain existing web interface

#### Phase 2: Full Migration
1. **Complete Feature Parity**: Implement all custom logic in FreeRADIUS
2. **API Integration**: Build REST API for management
3. **Monitoring**: Implement comprehensive monitoring

### 6.2 Alternative: Stay with Node.js (If Requirements Met)

#### Justification to Stay:
- **Custom Logic Complexity**: High level of business logic integration
- **Development Resources**: Team more familiar with JavaScript
- **Performance Needs**: Current performance is adequate
- **Feature Requirements**: No need for advanced EAP methods

#### Improvements to Consider:
- **Performance Optimization**: Use worker threads
- **Security Hardening**: Implement additional security measures
- **Monitoring Enhancement**: Add better monitoring tools
- **High Availability**: Implement clustering/load balancing

### 6.3 Migration Roadmap

#### Phase 1: Preparation (2-3 weeks)
1. **Setup FreeRADIUS Server**: Install and configure basic setup
2. **Database Integration**: Configure PostgreSQL module
3. **Mikrotik Dictionary**: Create custom dictionary
4. **Basic Testing**: Test authentication with existing users

#### Phase 2: Feature Implementation (4-6 weeks)
1. **Custom Policies**: Implement business logic in unlang
2. **API Development**: Build management API
3. **Monitoring Setup**: Implement monitoring tools
4. **Integration Testing**: Full integration testing

#### Phase 3: Migration (2-3 weeks)
1. **Parallel Running**: Run both systems simultaneously
2. **Gradual Cutover**: Migrate NAS devices gradually
3. **Monitoring**: Monitor both systems during transition
4. **Decommission**: Decommission Node.js RADIUS

#### Phase 4: Optimization (2-4 weeks)
1. **Performance Tuning**: Optimize FreeRADIUS configuration
2. **Monitoring Enhancement**: Improve monitoring and alerting
3. **Documentation**: Update all documentation
4. **Training**: Train team on FreeRADIUS

## 7. Cost-Benefit Analysis

### 7.1 Benefits of Migration
- **Performance**: 5-10x better performance
- **Scalability**: Better handling of high volume
- **Standards Compliance**: Full RADIUS compliance
- **Security**: Mature security implementation
- **Reliability**: Battle-tested stability

### 7.2 Costs of Migration
- **Development Time**: 8-16 weeks total migration time
- **Learning Curve**: Team training required
- **Complexity**: FreeRADIUS configuration complexity
- **Integration Work**: Significant API development needed
- **Testing**: Extensive testing required

### 7.3 ROI Calculation
- **Short Term**: High initial investment, moderate benefits
- **Long Term**: Lower maintenance, better performance, standards compliance

## 8. Recommendation

### 8.1 Final Recommendation: **CONDITIONAL MIGRATION**

**Migrate to FreeRADIUS IF:**
- Performance requirements exceed current Node.js capabilities (>500 RPS)
- Need advanced EAP methods (PEAP, EAP-TLS)
- Plan to support multiple NAS vendors beyond Mikrotik
- Have dedicated resources for migration and maintenance
- Requirements for enterprise-level RADIUS features

**Stay with Node.js IF:**
- Current performance meets requirements (<500 RPS)
- Custom business logic is complex and critical
- Limited development resources for migration
- Primarily Mikrotik environment with simple authentication needs
- Need tight integration with existing billing system

### 8.2 Next Steps
1. **Performance Testing**: Benchmark current system under load
2. **Requirements Gathering**: Define exact performance and feature requirements
3. **Proof of Concept**: Setup basic FreeRADIUS for testing
4. **Cost Analysis**: Detailed cost analysis including resources and time
5. **Decision Making**: Make final decision based on analysis

## 9. Appendix

### 9.1 Sample FreeRADIUS Configuration

#### /etc/freeradius/3.0/sites-available/default
```
server default {
    listen {
        type = auth
        ipaddr = *
        port = 1812
    }

    listen {
        type = acct
        ipaddr = *
        port = 1813
    }

    authorize {
        chap
        mschap
        sql
        mikrotik_group_assign
    }

    authenticate {
        Auth-Type CHAP {
            chap
        }
        Auth-Type MS-CHAP {
            mschap
        }
    }

    post-auth {
        Post-Auth-Type REJECT {
            attr_filter.access_reject
        }
        sql
        mikrotik_reply_attributes
    }

    accounting {
        sql
    }
}
```

#### /etc/freeradius/3.0/policy.d/mikrotik
```
# Mikrotik group assignment policy
mikrotik_group_assign {
    if ("%{sql:SELECT pppoe_profile FROM customers WHERE pppoe_username='%{User-Name}'}") {
        update reply {
            Mikrotik-Group := "%{sql:SELECT pppoe_profile FROM customers WHERE pppoe_username='%{User-Name}'}"
        }
    }

    # Fallback to package profile
    elsif ("%{sql:SELECT p.pppoe_profile FROM packages p JOIN customers c ON c.package_id = p.id WHERE c.pppoe_username='%{User-Name}'}") {
        update reply {
            Mikrotik-Group := "%{sql:SELECT p.pppoe_profile FROM packages p JOIN customers c ON c.package_id = p.id WHERE c.pppoe_username='%{User-Name}'}"
        }
    }
}

# Mikrotik reply attributes
mikrotik_reply_attributes {
    # Add rate limiting based on package
    if ("%{sql:SELECT rate_limit FROM packages p JOIN customers c ON c.package_id = p.id WHERE c.pppoe_username='%{User-Name}'}") {
        update reply {
            Mikrotik-Rate-Limit := "%{sql:SELECT rate_limit FROM packages p JOIN customers c ON c.package_id = p.id WHERE c.pppoe_username='%{User-Name}'}"
        }
    }
}
```

### 9.2 Migration Scripts

#### Database Migration (Minimal Changes Required)
```sql
-- FreeRADIUS uses standard RADIUS schema, minimal changes needed
-- Current schema is mostly compatible

-- Add NAS table if not exists (FreeRADIUS expects this)
CREATE TABLE IF NOT EXISTS nas (
    id SERIAL PRIMARY KEY,
    nasname VARCHAR(128) NOT NULL,
    shortname VARCHAR(32),
    type VARCHAR(30) DEFAULT 'other',
    ports INTEGER,
    secret VARCHAR(60) DEFAULT 'secret',
    server VARCHAR(64),
    community VARCHAR(50),
    description VARCHAR(200)
);

-- Map existing nas_servers to nas table
INSERT INTO nas (nasname, shortname, secret, type, description)
SELECT ip_address, short_name, secret, type, description
FROM nas_servers
WHERE is_active = true;
```

### 9.3 Testing Commands

#### Test Authentication
```bash
# Test PAP authentication
radtest username password radius_server_ip 1812 testing123

# Test CHAP authentication
echo "User-Name = username" | radclient -x radius_server_ip:1812 auth testing123

# Test Mikrotik VSA
echo "User-Name = username" | radclient -x radius_server_ip:1812 auth testing123 << EOF
Mikrotik-Group += "test-profile"
EOF
```

### 9.4 Monitoring Commands

#### Session Monitoring
```bash
# View active sessions
radwho -r

# SQL query for active sessions
psql -d billing_db -c "
SELECT username, framedipaddress, acctstarttime, acctsessiontime
FROM radacct
WHERE acctstoptime IS NULL;
"
```

This analysis provides a comprehensive view of the migration possibilities and challenges. The final decision should be based on specific performance requirements, available resources, and long-term scalability needs.