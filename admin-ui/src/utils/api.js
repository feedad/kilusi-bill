export async function apiGet(url, opts={}){
  const res = await fetch(url, { credentials: 'include', ...opts })
  if(!res.ok){
    const text = await res.text().catch(()=> '')
    throw new Error(`HTTP ${res.status} ${res.statusText}${text ? ` – ${text.slice(0,120)}...` : ''}`)
  }
  const ct = res.headers.get('content-type') || ''
  if(!ct.includes('application/json')){
    const text = await res.text().catch(()=> '')
    throw new Error(`Expected JSON, got: ${text.slice(0,120)}...`)
  }
  return res.json()
}

export async function apiPost(url, body={}, opts={}){
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers||{}) },
    body: JSON.stringify(body),
    ...opts,
  })
  const ct = res.headers.get('content-type') || ''
  const isJson = ct.includes('application/json')
  const payload = isJson ? await res.json() : await res.text().catch(()=> '')
  if(!res.ok) throw new Error(typeof payload === 'string' ? payload : (payload.message || JSON.stringify(payload)))
  return payload
}

export async function apiPut(url, body={}, opts={}){
  const res = await fetch(url, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers||{}) },
    body: JSON.stringify(body),
    ...opts,
  })
  const ct = res.headers.get('content-type') || ''
  const isJson = ct.includes('application/json')
  const payload = isJson ? await res.json() : await res.text().catch(()=> '')
  if(!res.ok) throw new Error(typeof payload === 'string' ? payload : (payload.message || JSON.stringify(payload)))
  return payload
}

export async function apiDelete(url, opts={}){
  const res = await fetch(url, { method:'DELETE', credentials:'include', ...(opts||{}) })
  const ct = res.headers.get('content-type') || ''
  const isJson = ct.includes('application/json')
  const payload = isJson ? await res.json() : await res.text().catch(()=> '')
  if(!res.ok) throw new Error(typeof payload === 'string' ? payload : (payload.message || JSON.stringify(payload)))
  return payload
}

// For legacy endpoints that redirect or return HTML after POST (no JSON)
export async function apiPostForm(url, body={}, opts={}){
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', ...(opts.headers||{}) },
    body: new URLSearchParams(body).toString(),
    redirect: 'follow',
    ...opts,
  })
  // Treat any 2xx as success regardless of content-type
  if(!res.ok){
    const text = await res.text().catch(()=> '')
    throw new Error(text || `HTTP ${res.status}`)
  }
  return { success: true }
}

// Upload helper for multipart/form-data
export async function apiUpload(url, formData, opts={}){
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    body: formData,
    ...opts,
  })
  const ct = res.headers.get('content-type') || ''
  const isJson = ct.includes('application/json')
  const payload = isJson ? await res.json() : await res.text().catch(()=> '')
  if(!res.ok) throw new Error(typeof payload === 'string' ? payload : (payload.message || JSON.stringify(payload)))
  return payload
}
