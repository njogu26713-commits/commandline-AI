import { Schema, model } from "mongoose";

// ── Project ───────────────────────────────────────────────────────────────────
export interface Project {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  language?: string | null;
  stars: number;
  forks: number;
  isPrivate: boolean;
  deploymentUrl?: string | null;
  githubUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const projectSchema = new Schema(
  {
    name:          { type: String, required: true },
    description:   { type: String, default: null },
    status:        { type: String, default: "active" },
    language:      { type: String, default: null },
    stars:         { type: Number, default: 0 },
    forks:         { type: Number, default: 0 },
    isPrivate:     { type: Boolean, default: false },
    deploymentUrl: { type: String, default: null },
    githubUrl:     { type: String, default: null },
  },
  { timestamps: true }
);

export const ProjectModel = model("Project", projectSchema);

// ── Project Template ──────────────────────────────────────────────────────────
export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  language: string;
  category: string;
  stars: number;
}

const projectTemplateSchema = new Schema({
  name:        { type: String, required: true },
  description: { type: String, required: true },
  language:    { type: String, required: true },
  category:    { type: String, required: true },
  stars:       { type: Number, default: 0 },
});

export const ProjectTemplateModel = model("ProjectTemplate", projectTemplateSchema);
