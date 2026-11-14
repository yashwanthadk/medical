import { jsPDF } from 'jspdf';
import type { MedicalReportRecord, SubType } from '../src/types/medical.ts';

function formatSubTypeLabel(subType: SubType): string {
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

export function generateServerMedicalPdfBuffer(report: MedicalReportRecord): Buffer {
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

  const addParagraph = (
    text: string,
    color: [number, number, number] = [51, 65, 85],
    fontSize = 9.5,
  ) => {
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

  const statusMap = {
    normal: {
      label: 'Status: Within Reference Range / No Flagged Finding Noted',
      bg: [240, 253, 244] as [number, number, number],
      fg: [22, 101, 52] as [number, number, number],
    },
    attention: {
      label: 'Status: Needs Attention or Further Clinical Review',
      bg: [255, 251, 235] as [number, number, number],
      fg: [146, 64, 14] as [number, number, number],
    },
    abnormal: {
      label: 'Status: Flagged / Abnormal Finding Requiring Medical Review',
      bg: [254, 242, 242] as [number, number, number],
      fg: [153, 27, 27] as [number, number, number],
    },
  };
  const st = statusMap[report.analysis.overallStatus] || statusMap.attention;
  doc.setFillColor(...st.bg);
  doc.roundedRect(margin, y, contentWidth, 26, 4, 4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...st.fg);
  doc.text(st.label, margin + 10, y + 17);
  y += 40;

  addSectionHeading('1', 'User-Provided Details');
  addParagraph(
    `Patient Name / Label: ${report.patientName || 'Not provided'}   |   Age: ${report.patientAge || 'Not provided'}   |   Sex: ${report.patientSex || 'Not provided'}`,
  );
  if (report.clinicalNotes) {
    addParagraph(`Clinical Notes / Context: ${report.clinicalNotes}`);
  }

  addSectionHeading('2', 'Report Type & Uploaded File');
  addParagraph(`${formatSubTypeLabel(report.subType)} — ${report.analysis.analysisTitle}`);
  addParagraph(
    `File: ${report.fileName} (${report.mimeType}, ${(report.fileSize / 1024).toFixed(1)} KB)`,
  );

  addSectionHeading('3', 'Analysis Date');
  addParagraph(
    `Analyzed on ${new Date(report.createdAt).toLocaleString()}   |   Report Date Provided: ${report.reportDateLabel || 'Not specified'}`,
  );

  if (report.analysis.bloodParameters && report.analysis.bloodParameters.length > 0) {
    addSectionHeading('4', 'Key Observations & Laboratory Parameters');
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
    addSectionHeading('4', 'Key Observations');
    for (const obs of report.analysis.imagingObservations) {
      ensureSpace(34);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(
        `${obs.region}  [${obs.status.toUpperCase()} · Educational Certainty: ${obs.confidence.toUpperCase()}]`,
        margin,
        y,
      );
      y += 12;
      addParagraph(`${obs.observation} — ${obs.plainLanguage}`, [71, 85, 105], 9);
    }
    addBulletList(report.analysis.keyObservations);
  } else {
    addSectionHeading('4', 'Key Observations');
    addBulletList(report.analysis.keyObservations);
  }

  addSectionHeading('5', 'Normal Findings');
  addBulletList(report.analysis.normalFindings, 'No specific normal findings highlighted.');

  addSectionHeading('6', 'Flagged / Abnormal Findings');
  addBulletList(
    report.analysis.abnormalFindings,
    'No flagged findings noted in this educational review.',
  );

  addSectionHeading('7', 'Simple-Language Explanation');
  addParagraph(report.analysis.simpleExplanation);

  addSectionHeading('8', 'Important Precautions & Next Steps');
  if (report.analysis.urgentCareNotice) {
    addParagraph(
      `URGENT CARE NOTICE: ${report.analysis.urgentCareNotice}`,
      [153, 27, 27],
      9.5,
    );
  }
  addBulletList(report.analysis.importantNotes);

  addSectionHeading('9', 'Image / Report Quality & AI Limitations');
  addParagraph(
    `Quality (${report.analysis.qualityAssessment.rating.toUpperCase()}): ${report.analysis.qualityAssessment.details}`,
  );
  addBulletList(report.analysis.limitations);

  addSectionHeading('10', 'Final Summary');
  addParagraph(report.analysis.finalSummary);

  addSectionHeading('11', 'Medical Disclaimer');
  addParagraph(
    'Educational information only. Not a medical diagnosis. AI-generated observations must not replace formal interpretation by a qualified physician, hematologist, or board-certified radiologist. Seek immediate medical attention for urgent or worsening symptoms.',
    [100, 116, 139],
    8.5,
  );

  return Buffer.from(doc.output('arraybuffer'));
}
