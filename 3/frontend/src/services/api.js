const API_BASE = '';

export const api = {
  async getPlanets() {
    const response = await fetch(`${API_BASE}/api/planets/`);
    if (!response.ok) throw new Error('Failed to fetch planets');
    return response.json();
  },
  
  async getPlanet(id) {
    const response = await fetch(`${API_BASE}/api/planets/${id}`);
    if (!response.ok) throw new Error('Failed to fetch planet');
    return response.json();
  },
  
  async getEvents(year, month) {
    const params = new URLSearchParams();
    if (year) params.append('year', year);
    if (month) params.append('month', month);
    const response = await fetch(`${API_BASE}/api/events/?${params.toString()}`);
    if (!response.ok) throw new Error('Failed to fetch events');
    return response.json();
  },
  
  async getUpcomingEvents(limit = 5) {
    const response = await fetch(`${API_BASE}/api/events/upcoming?limit=${limit}`);
    if (!response.ok) throw new Error('Failed to fetch upcoming events');
    return response.json();
  }
};
