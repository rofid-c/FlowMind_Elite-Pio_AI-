import os
import time
from playwright.sync_api import sync_playwright

SCREENSHOTS_DIR = os.path.join(os.getcwd(), "docs", "screenshots")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

def capture_all():
    with sync_playwright() as p:
        # Launch browser
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
        page = context.new_page()

        print("Navigating to http://localhost:5173/ ...")
        page.goto("http://localhost:5173/")
        page.wait_for_timeout(3000)

        # 1. Capture Ingestion Modal if triggerable
        upload_btn = page.locator("button:has-text('Unggah Dataset')").first
        if upload_btn.is_visible():
            upload_btn.click()
            page.wait_for_timeout(1500)
            img1_path = os.path.join(SCREENSHOTS_DIR, "01_dataset_ingestion.png")
            page.screenshot(path=img1_path)
            print(f"Captured: {img1_path}")
            
            # Close modal
            close_btn = page.locator("button:has-text('Batal')").or_(page.locator("button:has-text('✕')")).or_(page.locator("[aria-label='Close']")).first
            if close_btn.is_visible():
                close_btn.click()
            else:
                page.keyboard.press("Escape")
            page.wait_for_timeout(1000)

        # Ensure we select 'Customer Complaint 10K Analysis' in project dropdown if visible
        proj_select = page.locator("select").first
        if proj_select.is_visible():
            try:
                proj_select.select_option(label="Customer Complaint 10K Analysis")
                page.wait_for_timeout(1500)
            except Exception:
                pass

        # 2. Ringkasan (Overview)
        overview_tab = page.locator("button:has-text('Ringkasan')").first
        if overview_tab.is_visible():
            overview_tab.click()
            page.wait_for_timeout(2500)
            img2_path = os.path.join(SCREENSHOTS_DIR, "02_overview_dashboard.png")
            page.screenshot(path=img2_path)
            print(f"Captured: {img2_path}")

        # 3. Graf Proses (Process Map)
        process_tab = page.locator("button:has-text('Graf Proses')").first
        if process_tab.is_visible():
            process_tab.click()
            page.wait_for_timeout(4000)
            fit_btn = page.locator("button:has-text('Fit')").or_(page.locator("button[title*='Fit']")).first
            if fit_btn.is_visible():
                fit_btn.click()
                page.wait_for_timeout(1500)
            img3_path = os.path.join(SCREENSHOTS_DIR, "03_process_map.png")
            page.screenshot(path=img3_path)
            print(f"Captured: {img3_path}")

        # 4. Metrik & SLA
        metrics_tab = page.locator("button:has-text('Metrik & SLA')").first
        if metrics_tab.is_visible():
            metrics_tab.click()
            page.wait_for_timeout(2500)
            img4_path = os.path.join(SCREENSHOTS_DIR, "04_metrics_and_sla.png")
            page.screenshot(path=img4_path)
            print(f"Captured: {img4_path}")

        # 5. Varian Alur
        variants_tab = page.locator("button:has-text('Varian Alur')").first
        if variants_tab.is_visible():
            variants_tab.click()
            page.wait_for_timeout(2500)
            img5_path = os.path.join(SCREENSHOTS_DIR, "05_variants_explorer.png")
            page.screenshot(path=img5_path)
            print(f"Captured: {img5_path}")

        # 6. Temuan & Sinyal
        findings_tab = page.locator("button:has-text('Temuan & Sinyal')").first
        if findings_tab.is_visible():
            findings_tab.click()
            page.wait_for_timeout(2500)
            img6_path = os.path.join(SCREENSHOTS_DIR, "06_findings_signals.png")
            page.screenshot(path=img6_path)
            print(f"Captured: {img6_path}")

        # 7. Skenario What-If
        scenario_tab = page.locator("button:has-text('Skenario What-If')").first
        if scenario_tab.is_visible():
            scenario_tab.click()
            page.wait_for_timeout(2000)
            sim_btn = page.locator("button:has-text('Jalankan Simulasi')").or_(page.locator("button:has-text('Simulasi')")).first
            if sim_btn.is_visible():
                sim_btn.click()
                page.wait_for_timeout(3000)
            img7_path = os.path.join(SCREENSHOTS_DIR, "07_scenario_whatif.png")
            page.screenshot(path=img7_path)
            print(f"Captured: {img7_path}")

        # 8. Pio_AI Analyst
        ai_tab = page.locator("button:has-text('Pio_AI Analyst')").first
        if ai_tab.is_visible():
            ai_tab.click()
            page.wait_for_timeout(2000)
            # Click suggested question if present
            sugg_btn = page.locator("button:has-text('Mengapa proses ini lambat?')").or_(page.locator("button:has-text('transisi bottleneck')")).first
            if sugg_btn.is_visible():
                sugg_btn.click()
                page.wait_for_timeout(6000)
            img8_path = os.path.join(SCREENSHOTS_DIR, "08_pio_ai_analyst.png")
            page.screenshot(path=img8_path)
            print(f"Captured: {img8_path}")

        browser.close()
        print("All 8 screenshots successfully captured!")

if __name__ == "__main__":
    capture_all()

