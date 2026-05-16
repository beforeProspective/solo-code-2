import pypdfium2 as pdfium
import os
from typing import Tuple
from PIL import Image
import io

class PDFService:
    UPLOAD_DIR = "uploads"
    SIGNED_DIR = "signed"

    @staticmethod
    def _get_abs_path(file_path: str) -> str:
        return os.path.abspath(file_path)

    @staticmethod
    def get_total_pages(file_path: str) -> int:
        abs_path = PDFService._get_abs_path(file_path)
        with open(abs_path, 'rb') as f:
            pdf = pdfium.PdfDocument(f)
            page_count = len(pdf)
            pdf.close()
        return page_count

    @staticmethod
    def get_page_size(file_path: str, page_num: int) -> Tuple[float, float]:
        abs_path = PDFService._get_abs_path(file_path)
        with open(abs_path, 'rb') as f:
            pdf = pdfium.PdfDocument(f)
            page = pdf[page_num]
            width, height = page.get_size()
            pdf.close()
        return width, height

    @staticmethod
    def save_uploaded_file(file_content: bytes, filename: str) -> Tuple[str, str]:
        os.makedirs(PDFService.UPLOAD_DIR, exist_ok=True)
        import uuid
        stored_name = f"{uuid.uuid4()}_{filename}"
        file_path = os.path.join(PDFService.UPLOAD_DIR, stored_name)
        abs_path = os.path.abspath(file_path)
        with open(abs_path, "wb") as f:
            f.write(file_content)
        return stored_name, abs_path

    @staticmethod
    def render_page_to_image(file_path: str, page_num: int, scale: float = 2.0) -> bytes:
        abs_path = PDFService._get_abs_path(file_path)
        with open(abs_path, 'rb') as f:
            pdf = pdfium.PdfDocument(f)
            page = pdf[page_num - 1]
            pil_image = page.render(scale=scale).to_pil()
            pdf.close()
        
        img_buffer = io.BytesIO()
        pil_image.save(img_buffer, format="PNG")
        return img_buffer.getvalue()
