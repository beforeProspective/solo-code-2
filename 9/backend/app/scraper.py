import httpx
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
from typing import Dict, Optional

async def fetch_page_metadata(url: str) -> Dict[str, str]:
    result = {
        "title": "",
        "description": "",
        "thumbnail": ""
    }
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, "html.parser")
            
            title_tag = soup.find("meta", property="og:title")
            if title_tag and title_tag.get("content"):
                result["title"] = title_tag["content"]
            else:
                title = soup.find("title")
                if title:
                    result["title"] = title.text.strip()
            
            description_tag = soup.find("meta", property="og:description")
            if description_tag and description_tag.get("content"):
                result["description"] = description_tag["content"]
            else:
                desc = soup.find("meta", attrs={"name": "description"})
                if desc and desc.get("content"):
                    result["description"] = desc["content"]
            
            image_tag = soup.find("meta", property="og:image")
            if image_tag and image_tag.get("content"):
                image_url = image_tag["content"]
                parsed_url = urlparse(url)
                if not urlparse(image_url).scheme:
                    image_url = urljoin(f"{parsed_url.scheme}://{parsed_url.netloc}", image_url)
                result["thumbnail"] = image_url
            
    except Exception as e:
        print(f"Error fetching metadata for {url}: {e}")
    
    return result
