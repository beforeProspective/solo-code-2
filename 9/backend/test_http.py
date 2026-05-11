import os
import sys

os.environ['PYTHONDONTWRITEBYTECODE'] = '1'

import shutil
for root, dirs, files in os.walk('.'):
    for d in dirs:
        if d == '__pycache__':
            try:
                shutil.rmtree(os.path.join(root, d))
            except:
                pass

import importlib
importlib.invalidate_caches()

import httpx

print("Testing with FRESH Python imports...")
print()

base_url = "http://localhost:8000"

print("1. Testing health check...")
resp = httpx.get(f"{base_url}/health")
print(f"   Status: {resp.status_code}")
print(f"   Response: {resp.text}")

print()
print("2. Testing registration...")
resp = httpx.post(f"{base_url}/api/auth/register", json={
    'username': 'test_http',
    'email': 'http@test.com',
    'password': 'testpass123'
})
print(f"   Status: {resp.status_code}")
print(f"   Response: {resp.text[:800]}")

if resp.status_code == 200:
    token = resp.json()['access_token']
    
    print()
    print("3. Testing JSON login...")
    resp2 = httpx.post(f"{base_url}/api/auth/login/json", json={
        'username': 'test_http',
        'password': 'testpass123'
    })
    print(f"   Status: {resp2.status_code}")
    print(f"   Response: {resp2.text[:500]}")
    
    print()
    print("4. Testing /me with token...")
    resp3 = httpx.get(f"{base_url}/api/auth/me", headers={
        'Authorization': f'Bearer {token}'
    })
    print(f"   Status: {resp3.status_code}")
    print(f"   Response: {resp3.text}")

print()
print("=" * 50)
print("TESTS COMPLETED")
print("=" * 50)
