import { jsPDF } from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist';
import type { MedicalReportRecord, SubType } from '../types/medical';

// Configure PDF.js worker via module CDN fallback or inline worker URL
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export async function extractTextFromPdfFile(file: File): Promise<{
  text: string;
  pageCount: number;
}> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const pages: string[] = [];
    const maxPages = Math.min(pdf.numPages, 12);

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .filter(Boolean);
      pages.push(strings.join(' '));
    }

    return {
      text: pages.join('\n\n').trim(),
      pageCount: pdf.numPages,
    };
  } catch {
    return { text: '', pageCount: 0 };
  }
}

export async function inspectImageQuality(file: File): Promise<{
  width: number;
  height: number;
  qualityNote: string;
  isLowRes: boolean;
}> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      URL.revokeObjectURL(url);
      const isLowRes = width < 400 || height < 400;
      resolve({
        width,
        height,
        isLowRes,
        qualityNote: isLowRes
          ? `Low resolution (${width} x ${height} px). Fine details may be difficult to evaluate.`
          : `Clear resolution (${width} x ${height} px) suitable for educational review.`,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: 0,
        height: 0,
        isLowRes: true,
        qualityNote: 'Unable to verify image dimensions in browser preview.',
      });
    };
    img.src = url;
  });
}

export function formatSubTypeLabel(subType: SubType): string {
  switch (subType) {
    case 'blood_panel':
      return 'Blood Test Report Analysis';
    case 'bone_xray':
      return 'Bone X-ray Analysis';
    case 'chest_xray':
      return 'Chest X-ray Analysis';
    case 'brain_mri':
      return 'Brain MRI Scan Analysis';
    case 'muscle_mri':
      return 'Muscle MRI Scan Analysis';
    case 'soft_tissue_mri':
      return 'Soft Tissue MRI Scan Analysis';
  }
}

export function downloadMedicalSummaryPdf(report: MedicalReportRecord): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 44;
  const contentWidth = pageWidth - margin * 2;
  let y = 48;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 52) {
      doc.addPage();
      y = 48;
    }
  };

  const addSectionHeading = (num: string, title: string) => {
    ensureSpace(34);
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`${num}. ${title}`, margin, y);
    y += 5;
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageWidth - margin, y);
    y += 14;
  };

  const addParagraph = (text: string, color: [number, number, number] = [51, 65, 85], fontSize = 9.5) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text || 'None noted.', contentWidth) as string[];
    for (const line of lines) {
      ensureSpace(14);
      doc.text(line, margin, y);
      y += 13;
    }
    y += 4;
  };

  const addBulletList = (items: string[], emptyFallback = 'None reported.') => {
    if (!items || items.length === 0) {
      addParagraph(emptyFallback);
      return;
    }
    for (const item of items) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(51, 65, 85);
      const lines = doc.splitTextToSize(`•  ${item}`, contentWidth - 8) as string[];
      for (const line of lines) {
        ensureSpace(14);
        doc.text(line, margin + 4, y);
        y += 13;
      }
      y += 2;
    }
    y += 4;
  };

  // Header Banner
  doc.setFillColor(15, 118, 110);
  doc.rect(0, 0, pageWidth, 74, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(255, 255, 255);
  doc.text('MediScan AI — Educational Medical Summary Report', margin, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(204, 251, 241);
  doc.text('Informational AI Explanation · Not a Medical Diagnosis', margin, 52);

  y = 98;

  // Status banner box
  const statusMap = {
    normal: { label: 'Status: Within Reference Range / No Flagged Finding', bg: [240, 253, 244] as [number, number, number], fg: [22, 101, 52] as [number, number, number] },
    attention: { label: 'Status: Needs Attention or Further Clinical Review', bg: [255, 251, 235] as [number, number, number], fg: [146, 64, 14] as [number, number, number] },
    abnormal: { label: 'Status: Abnormal Finding Requiring Medical Review', bg: [254, 242, 242] as [number, number, number], fg: [153, 27, 27] as [number, number, number] },
  };
  const st = statusMap[report.analysis.overallStatus] || statusMap.attention;
  doc.setFillColor(...st.bg);
  doc.roundedRect(margin, y, contentWidth, 26, 4, 4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...st.fg);
  doc.text(st.label, margin + 10, y + 17);
  y += 40;

  // 1. Patient-provided details
  addSectionHeading('1', 'Patient-Provided Details');
  addParagraph(
    `Name / Identifier: ${report.patientName || 'Not provided'}   |   Age: ${report.patientAge || 'Not provided'}   |   Sex: ${report.patientSex || 'Not provided'}`,
  );
  if (report.clinicalNotes) {
    addParagraph(`Clinical Notes / Context: ${report.clinicalNotes}`);
  }

  // 2. Report or scan type
  addSectionHeading('2', 'Report or Scan Type');
  addParagraph(`${formatSubTypeLabel(report.subType)} — ${report.analysis.analysisTitle}`);

  // 3. Uploaded file name
  addSectionHeading('3', 'Uploaded File Name');
  addParagraph(`${report.fileName} (${report.mimeType}, ${(report.fileSize / 1024).toFixed(1)} KB)`);

  // 4. Analysis date
  addSectionHeading('4', 'Analysis Date');
  addParagraph(
    `Analyzed on ${new Date(report.createdAt).toLocaleString()}   |   Report Date Provided: ${report.reportDateLabel || 'Not specified'}`,
  );

  // Blood Parameters Table if blood report
  if (report.analysis.bloodParameters && report.analysis.bloodParameters.length > 0) {
    addSectionHeading('5', 'Key Observations & Laboratory Parameters');
    for (const param of report.analysis.bloodParameters) {
      ensureSpace(34);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(
        `${param.name}: ${param.value} ${param.unit}  (Ref: ${param.referenceRange})  [${param.status.toUpperCase()}]`,
        margin,
        y,
      );
      y += 12;
      addParagraph(param.explanation, [71, 85, 105], 9);
    }
    addBulletList(report.analysis.keyObservations);
  } else if (report.analysis.imagingObservations && report.analysis.imagingObservations.length > 0) {
    addSectionHeading('5', 'Key Observations');
    for (const obs of report.analysis.imagingObservations) {
      ensureSpace(34);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(
        `${obs.region}  [${obs.status.toUpperCase()} · Model Confidence: ${obs.confidence.toUpperCase()}]`,
        margin,
        y,
      );
      y += 12;
      addParagraph(`${obs.observation} — ${obs.plainLanguage}`, [71, 85, 105], 9);
    }
    addBulletList(report.analysis.keyObservations);
  } else {
    addSectionHeading('5', 'Key Observations');
    addBulletList(report.analysis.keyObservations);
  }

  // 6. Normal findings
  addSectionHeading('6', 'Normal Findings');
  addBulletList(report.analysis.normalFindings, 'No specific normal findings highlighted.');

  // 7. Abnormal findings
  addSectionHeading('7', 'Abnormal or Flagged Findings');
  addBulletList(report.analysis.abnormalFindings, 'No abnormal findings flagged in this educational review.');

  // 8. Simple-language explanation
  addSectionHeading('8', 'Simple-Language Explanation');
  addParagraph(report.analysis.simpleExplanation);

  // 9. Important precautions
  addSectionHeading('9', 'Important Precautions & Next Steps');
  if (report.analysis.urgentCareNotice) {
    addParagraph(`URGENT CARE NOTICE: ${report.analysis.urgentCareNotice}`, [153, 27, 27], 9.5);
  }
  addBulletList(report.analysis.importantNotes);

  // 10. AI limitations and disclaimer
  addSectionHeading('10', 'AI Limitations, Quality Assessment & Medical Disclaimer');
  addParagraph(
    `Image / Report Quality (${report.analysis.qualityAssessment.rating.toUpperCase()}): ${report.analysis.qualityAssessment.details}`,
  );
  addBulletList(report.analysis.limitations);
  addParagraph(
    'MEDICAL DISCLAIMER: This report was generated by MediScan AI for educational and informational purposes only. It is NOT a medical diagnosis, clinical validation, or substitute for review by a qualified physician, hematologist, or board-certified radiologist. Seek immediate medical care if you experience urgent or worsening symptoms.',
    [100, 116, 139],
    8.5,
  );

  // 11. Final summary
  addSectionHeading('11', 'Final Summary');
  addParagraph(report.analysis.finalSummary);

  const safeBase = report.fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`MediScan_Summary_${safeBase}.pdf`);
}
