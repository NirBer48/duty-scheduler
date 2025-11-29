// In production (Docker), use relative URL so nginx can proxy
// In development, use localhost:4000
const BASE = import.meta.env.VITE_API_BASE || (import.meta.env.PROD ? '/api' : 'http://localhost:4000/api');

export async function fetchPeople() { 
  return fetch(BASE + '/people').then(r => r.json()); 
}

export async function addPerson(body: { name: string; gender: string; sameGenderPref: boolean }) { 
  return fetch(BASE + '/people', { 
    method: 'POST', 
    headers: { 'Content-Type': 'application/json' }, 
    body: JSON.stringify(body) 
  }).then(r => r.json()); 
}

export async function deletePerson(id: number) { 
  return fetch(BASE + '/people/' + id, { method: 'DELETE' }).then(r => r.json()); 
}

export async function fetchPosts() { 
  return fetch(BASE + '/posts').then(r => r.json()); 
}

export async function addPost(body: { name: string; requiredPerShift: number }) { 
  return fetch(BASE + '/posts', { 
    method: 'POST', 
    headers: { 'Content-Type': 'application/json' }, 
    body: JSON.stringify(body) 
  }).then(r => r.json()); 
}

export async function deletePost(id: number) { 
  return fetch(BASE + '/posts/' + id, { method: 'DELETE' }).then(r => r.json()); 
}

export async function generateSchedule(
  startISO: string, 
  endISO: string, 
  shiftOverrides: { postId: number; day: string; shiftLabel: string; requiredPerShift: number }[] = [],
  esAssignments: { groupId: string; personIds: number[] }[] = []
) { 
  return fetch(BASE + '/schedule/generate', { 
    method: 'POST', 
    headers: { 'Content-Type': 'application/json' }, 
    body: JSON.stringify({ startISO, endISO, shiftOverrides, esAssignments }) 
  }).then(r => r.json()); 
}
