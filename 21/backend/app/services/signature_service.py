import pypdf
import os
import base64
from io import BytesIO
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
import uuid
from typing import List, Dict

class SignatureService:
    SIGNED_DIR = "signed"

    @staticmethod
    def _get_abs_path(file_path: str) -> str:
        return os.path.abspath(file_path)

    @staticmethod
    def decode_signature(signature_data: str) -> bytes:
        if signature_data.startswith("data:image"):
            signature_data = signature_data.split(",")[1]
        return base64.b64decode(signature_data)

    @staticmethod
    def save_signature_image(signature_bytes: bytes) -> str:
        os.makedirs(SignatureService.SIGNED_DIR, exist_ok=True)
        filename = f"sig_{uuid.uuid4()}.png"
        file_path = os.path.join(SignatureService.SIGNED_DIR, filename)
        abs_path = os.path.abspath(file_path)
        with open(abs_path, "wb") as f:
            f.write(signature_bytes)
        return abs_path

    @staticmethod
    def apply_signature_to_pdf(
        pdf_path: str,
        signature_image_path: str,
        positions: List[Dict],
        output_path: str
    ) -> str:
        return SignatureService.apply_multiple_signatures(
            pdf_path,
            [{"image_path": signature_image_path, "positions": positions}],
            output_path
        )

    @staticmethod
    def apply_multiple_signatures(
        pdf_path: str,
        signatures: List[Dict],
        output_path: str
    ) -> str:
        os.makedirs(SignatureService.SIGNED_DIR, exist_ok=True)
        
        pdf_abs_path = SignatureService._get_abs_path(pdf_path)
        output_abs_path = SignatureService._get_abs_path(output_path)
        
        reader = pypdf.PdfReader(pdf_abs_path)
        writer = pypdf.PdfWriter()
        
        for page_num in range(len(reader.pages)):
            page = reader.pages[page_num]
            page_width = float(page.mediabox.width)
            page_height = float(page.mediabox.height)
            
            page_signatures = []
            for sig_data in signatures:
                sig_positions = [
                    p for p in sig_data["positions"] 
                    if p["page"] == page_num + 1
                ]
                if sig_positions:
                    page_signatures.append({
                        "image_path": sig_data["image_path"],
                        "positions": sig_positions
                    })
            
            if page_signatures:
                packet = BytesIO()
                c = canvas.Canvas(packet, pagesize=(page_width, page_height))
                
                for sig_data in page_signatures:
                    sig_abs_path = SignatureService._get_abs_path(sig_data["image_path"])
                    sig_img = Image.open(sig_abs_path)
                    sig_img = sig_img.convert("RGBA")
                    
                    for pos in sig_data["positions"]:
                        x = pos["x"]
                        y = pos["y"]
                        width = pos["width"]
                        height = pos["height"]
                        
                        pdf_y = page_height - y - height
                        
                        c.drawImage(
                            ImageReader(sig_img),
                            x,
                            pdf_y,
                            width=width,
                            height=height,
                            mask='auto'
                        )
                
                c.save()
                packet.seek(0)
                
                overlay_pdf = pypdf.PdfReader(packet)
                overlay_page = overlay_pdf.pages[0]
                page.merge_page(overlay_page)
            
            writer.add_page(page)
        
        with open(output_abs_path, "wb") as f:
            writer.write(f)
        
        return output_abs_path

    @staticmethod
    def apply_signature_with_signer(
        pdf_path: str,
        signature_bytes: bytes,
        position: Dict,
        output_path: str
    ) -> str:
        sig_path = SignatureService.save_signature_image(signature_bytes)
        return SignatureService.apply_signature_to_pdf(
            pdf_path, sig_path, [position], output_path
        )
