export type ModuleType = 'blood' | 'xray' | 'mri';

export type SubType =
  | 'blood_panel'
  | 'bone_xray'
  | 'chest_xray'
  | 'brain_mri'
  | 'muscle_mri'
  | 'soft_tissue_mri';

export type FindingSeverity = 'normal' | 'attention' | 'abnormal';

export type ConfidenceLevel = 'high' | 'moderate' | 'low';

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface BloodParameter {
  name: string;
  value: string;
  unit: string;
  referenceRange: string;
  status: FindingSeverity;
  explanation: string;
}

export interface ImagingObservation {
  region: string;
  observation: string;
  status: FindingSeverity;
  confidence: ConfidenceLevel;
  plainLanguage: string;
}

export interface MedicalAnalysisResult {
  overallStatus: FindingSeverity;
  analysisTitle: string;
  keyObservations: string[];
  normalFindings: string[];
  abnormalFindings: string[];
  simpleExplanation: string;
  importantNotes: string[];
  qualityAssessment: {
    rating: 'good' | 'fair' | 'limited';
    details: string;
  };
  limitations: string[];
  finalSummary: string;
  urgentCareNotice?: string;
  bloodParameters?: BloodParameter[];
  imagingObservations?: ImagingObservation[];
}

export interface PatientContext {
  patientName: string;
  patientAge: string;
  patientSex: string;
  reportDateLabel: string;
  clinicalNotes: string;
}

export interface MedicalReportRecord {
  id: string;
  userId: string;
  moduleType: ModuleType;
  subType: SubType;
  patientName: string;
  patientAge: string;
  patientSex: string;
  reportDateLabel: string;
  clinicalNotes: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  status: FindingSeverity;
  analysis: MedicalAnalysisResult;
  createdAt: string;
}

export interface MedicalReportSummary {
  id: string;
  moduleType: ModuleType;
  subType: SubType;
  patientName: string;
  reportDateLabel: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  status: FindingSeverity;
  analysisTitle: string;
  finalSummary: string;
  createdAt: string;
}
