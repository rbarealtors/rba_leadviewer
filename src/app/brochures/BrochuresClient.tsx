"use client";

import { useState, useMemo, useRef } from "react";
import Link from "next/link";
import type { Brochure } from "@/lib/brochures/types";
import {
  formatFileSize,
  MAX_BROCHURE_FILE_SIZE_BYTES,
  parseXhrErrorMessage,
} from "@/lib/brochures/validate";
import { formatDate, formatDateTime } from "@/lib/date-utils";
import { optimizePdfClient } from "@/lib/brochures/client-optimize";
import type { OptimizePdfProgress } from "@/lib/brochures/optimize";

interface BrochuresClientProps {
  initialBrochures: Brochure[];
  knownProjects: string[];
  userRole: string;
  maxSourceMb?: number;
}

export function BrochuresClient({
  initialBrochures,
  knownProjects: initialKnownProjects,
  userRole,
  maxSourceMb: initialMaxSourceMb = 150,
}: BrochuresClientProps) {
  const maxSourceMb = initialMaxSourceMb;
  const maxSourceSizeBytes = maxSourceMb * 1024 * 1024;
  const [brochures, setBrochures] = useState<Brochure[]>(initialBrochures);
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProject, setSelectedProject] = useState<string>("all");

  // Dialog States
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [editingBrochure, setEditingBrochure] = useState<Brochure | null>(null);
  const [replacingBrochure, setReplacingBrochure] = useState<Brochure | null>(null);
  const [confirmArchiveBrochure, setConfirmArchiveBrochure] = useState<Brochure | null>(null);
  const [confirmRestoreBrochure, setConfirmRestoreBrochure] = useState<Brochure | null>(null);

  // Upload Form State
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadProject, setUploadProject] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadOptimizeNotice, setUploadOptimizeNotice] = useState<string | null>(null);
  const [uploadOptimizeProgress, setUploadOptimizeProgress] = useState<OptimizePdfProgress | null>(null);
  const [uploadSourceSize, setUploadSourceSize] = useState<string | null>(null);
  const [isOptimizingUpload, setIsOptimizingUpload] = useState(false);
  const [isSubmittingUpload, setIsSubmittingUpload] = useState(false);
  const uploadFileInputRef = useRef<HTMLInputElement>(null);

  // Edit Metadata Form State
  const [editTitle, setEditTitle] = useState("");
  const [editProject, setEditProject] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Replace File Form State
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [replaceProgress, setReplaceProgress] = useState<number | null>(null);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const [replaceOptimizeNotice, setReplaceOptimizeNotice] = useState<string | null>(null);
  const [replaceOptimizeProgress, setReplaceOptimizeProgress] = useState<OptimizePdfProgress | null>(null);
  const [replaceSourceSize, setReplaceSourceSize] = useState<string | null>(null);
  const [isOptimizingReplace, setIsOptimizingReplace] = useState(false);
  const [isSubmittingReplace, setIsSubmittingReplace] = useState(false);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);

  // Project List for Filters
  const allProjects = useMemo(() => {
    const list = new Set(initialKnownProjects);
    brochures.forEach((b) => {
      if (b.project_name?.trim()) list.add(b.project_name.trim());
    });
    return Array.from(list).sort();
  }, [brochures, initialKnownProjects]);

  // Duplicate Check for Upload Soft Warning
  const duplicateWarning = useMemo(() => {
    if (!uploadTitle.trim()) return false;
    const titleLower = uploadTitle.trim().toLowerCase();
    const projectLower = uploadProject.trim().toLowerCase();

    return brochures.some((b) => {
      if (b.archived_at !== null) return false;
      const bTitle = b.title.trim().toLowerCase();
      const bProj = (b.project_name || "").trim().toLowerCase();
      return bTitle === titleLower && bProj === projectLower;
    });
  }, [brochures, uploadTitle, uploadProject]);

  // Filtered Brochures
  const filteredBrochures = useMemo(() => {
    return brochures.filter((b) => {
      const isArchived = b.archived_at !== null;
      if (tab === "active" && isArchived) return false;
      if (tab === "archived" && !isArchived) return false;

      // Project filter
      if (selectedProject !== "all") {
        if (selectedProject === "general") {
          if (b.project_name) return false;
        } else if (b.project_name?.toLowerCase() !== selectedProject.toLowerCase()) {
          return false;
        }
      }

      // Search term filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesTitle = b.title.toLowerCase().includes(term);
        const matchesProject = b.project_name?.toLowerCase().includes(term);
        const matchesDesc = b.description?.toLowerCase().includes(term);
        const matchesFilename = b.original_filename?.toLowerCase().includes(term);
        if (!matchesTitle && !matchesProject && !matchesDesc && !matchesFilename) {
          return false;
        }
      }

      return true;
    });
  }, [brochures, tab, selectedProject, searchTerm]);

  // Validate PDF client-side (size + %PDF- magic bytes)
  const validatePdfFileClient = async (
    file: File,
  ): Promise<{ valid: boolean; error?: string }> => {
    if (file.size === 0) {
      return { valid: false, error: "The selected file is empty." };
    }
    if (file.size > MAX_BROCHURE_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: `File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 25 MB limit.`,
      };
    }

    try {
      const slice = file.slice(0, 5);
      const buffer = await slice.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      if (
        bytes[0] !== 0x25 ||
        bytes[1] !== 0x50 ||
        bytes[2] !== 0x44 ||
        bytes[3] !== 0x46 ||
        bytes[4] !== 0x2d
      ) {
        return {
          valid: false,
          error: "Selected file does not have a valid PDF header (%PDF-).",
        };
      }
    } catch {
      return { valid: false, error: "Could not read file header." };
    }

    return { valid: true };
  };

  const openUploadModal = () => {
    setUploadTitle("");
    setUploadProject("");
    setUploadDesc("");
    setUploadFile(null);
    setUploadProgress(null);
    setUploadError(null);
    setUploadOptimizeNotice(null);
    setUploadOptimizeProgress(null);
    setUploadSourceSize(null);
    setIsOptimizingUpload(false);
    if (uploadFileInputRef.current) uploadFileInputRef.current.value = "";
    setIsUploadOpen(true);
  };

  const closeUploadModal = () => {
    if (isSubmittingUpload || isOptimizingUpload) return;
    setIsUploadOpen(false);
    setUploadError(null);
    setUploadOptimizeNotice(null);
    setUploadOptimizeProgress(null);
    setUploadSourceSize(null);
    setIsOptimizingUpload(false);
  };

  const handleUploadFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setUploadError(null);
    setUploadOptimizeNotice(null);
    setUploadOptimizeProgress(null);
    setUploadSourceSize(null);

    if (!file) {
      setUploadFile(null);
      return;
    }

    try {
      const slice = file.slice(0, 5);
      const buffer = await slice.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      if (
        bytes[0] !== 0x25 ||
        bytes[1] !== 0x50 ||
        bytes[2] !== 0x44 ||
        bytes[3] !== 0x46 ||
        bytes[4] !== 0x2d
      ) {
        setUploadError("Selected file does not have a valid PDF header (%PDF-).");
        setUploadFile(null);
        if (uploadFileInputRef.current) uploadFileInputRef.current.value = "";
        return;
      }
    } catch {
      setUploadError("Could not read file header.");
      setUploadFile(null);
      if (uploadFileInputRef.current) uploadFileInputRef.current.value = "";
      return;
    }

    if (file.size <= MAX_BROCHURE_FILE_SIZE_BYTES) {
      setUploadFile(file);
      return;
    }

    // Check configured maximum browser source limit before reading file into memory
    if (file.size > maxSourceSizeBytes) {
      setUploadError(
        `This PDF is ${formatFileSize(file.size)}, which is above the current browser processing limit of ${maxSourceMb} MB.`,
      );
      setUploadFile(null);
      if (uploadFileInputRef.current) uploadFileInputRef.current.value = "";
      return;
    }

    // Oversized (>25 MB and <= configured limit): Optimize locally in the browser with real progress tracking
    setIsOptimizingUpload(true);
    setUploadFile(null);
    setUploadSourceSize(formatFileSize(file.size));
    setUploadOptimizeProgress({
      phase: "reading",
      phaseLabel: "Reading PDF",
      detail: `Reading ${formatFileSize(file.size)} document...`,
      percent: 5,
    });

    try {
      const result = await optimizePdfClient(
        file,
        (progress) => {
          setUploadOptimizeProgress(progress);
        },
        maxSourceSizeBytes,
      );

      if (result.success && result.file) {
        setUploadFile(result.file);
        setUploadOptimizeProgress(null);
        const origStr = formatFileSize(result.originalSizeBytes);
        const optStr = formatFileSize(result.optimizedSizeBytes!);
        const reductionStr = result.reductionPercent
          ? ` (-${result.reductionPercent}%)`
          : "";
        setUploadOptimizeNotice(
          `Optimized: ${origStr} → ${optStr}${reductionStr}. Ready to upload.`,
        );
      } else {
        setUploadError(
          result.error ||
            "This PDF could not be reduced below 25 MB. Please choose a smaller PDF.",
        );
        setUploadOptimizeProgress(null);
        setUploadOptimizeNotice(null);
        setUploadFile(null);
        if (uploadFileInputRef.current) uploadFileInputRef.current.value = "";
      }
    } catch {
      setUploadError("This PDF could not be reduced below 25 MB. Please choose a smaller PDF.");
      setUploadOptimizeProgress(null);
      setUploadOptimizeNotice(null);
      setUploadFile(null);
      if (uploadFileInputRef.current) uploadFileInputRef.current.value = "";
    } finally {
      setIsOptimizingUpload(false);
    }
  };

  // Submit Upload
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isOptimizingUpload) return;
    setUploadError(null);

    if (!uploadTitle.trim()) {
      setUploadError("Brochure title is required.");
      return;
    }
    if (!uploadFile) {
      setUploadError("Please select a PDF file.");
      return;
    }

    if (uploadFile.size > MAX_BROCHURE_FILE_SIZE_BYTES) {
      setUploadError("This PDF could not be reduced below 25 MB. Please choose a smaller PDF.");
      return;
    }

    const validation = await validatePdfFileClient(uploadFile);
    if (!validation.valid) {
      setUploadError(validation.error || "Invalid PDF file.");
      return;
    }

    setIsSubmittingUpload(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("title", uploadTitle.trim());
    if (uploadProject.trim()) {
      formData.append("project_name", uploadProject.trim());
    }
    if (uploadDesc.trim()) {
      formData.append("description", uploadDesc.trim());
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/brochures");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percent);
      }
    };

    xhr.onload = () => {
      setIsSubmittingUpload(false);
      try {
        const res = JSON.parse(xhr.responseText);
        if (xhr.status === 201 && res.success && res.brochure) {
          setBrochures((prev) => [res.brochure, ...prev]);
          setIsUploadOpen(false);
          // Reset form
          setUploadTitle("");
          setUploadProject("");
          setUploadDesc("");
          setUploadFile(null);
          setUploadProgress(null);
          setUploadError(null);
          setUploadOptimizeNotice(null);
          setIsOptimizingUpload(false);
          if (uploadFileInputRef.current) uploadFileInputRef.current.value = "";
          return;
        }
      } catch {
        // Fall through to parseXhrErrorMessage
      }

      setUploadError(parseXhrErrorMessage(xhr, "Upload failed. Please try again."));
      setUploadProgress(null);
    };

    xhr.onerror = () => {
      setIsSubmittingUpload(false);
      setUploadProgress(null);
      setUploadError("Network error while uploading. Please check connection.");
    };

    xhr.send(formData);
  };

  // Start Edit Metadata
  const openEditModal = (b: Brochure) => {
    setEditingBrochure(b);
    setEditTitle(b.title);
    setEditProject(b.project_name || "");
    setEditDesc(b.description || "");
    setEditError(null);
  };

  // Submit Edit Metadata
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBrochure) return;
    setEditError(null);

    if (!editTitle.trim()) {
      setEditError("Title cannot be empty.");
      return;
    }

    setIsSubmittingEdit(true);
    try {
      const res = await fetch(`/api/brochures/${editingBrochure.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          project_name: editProject.trim() || null,
          description: editDesc.trim() || null,
          updated_at: editingBrochure.updated_at,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || "Could not update brochure.");
        return;
      }

      setBrochures((prev) =>
        prev.map((b) => (b.id === data.brochure.id ? data.brochure : b)),
      );
      setEditingBrochure(null);
    } catch {
      setEditError("Network request failed.");
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Start Replace File
  const openReplaceModal = (b: Brochure) => {
    setReplacingBrochure(b);
    setReplaceFile(null);
    setReplaceError(null);
    setReplaceProgress(null);
    setReplaceOptimizeNotice(null);
    setReplaceOptimizeProgress(null);
    setReplaceSourceSize(null);
    setIsOptimizingReplace(false);
    if (replaceFileInputRef.current) replaceFileInputRef.current.value = "";
  };

  const closeReplaceModal = () => {
    if (isSubmittingReplace || isOptimizingReplace) return;
    setReplacingBrochure(null);
    setReplaceError(null);
    setReplaceOptimizeNotice(null);
    setReplaceOptimizeProgress(null);
    setReplaceSourceSize(null);
    setIsOptimizingReplace(false);
  };

  const handleReplaceFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setReplaceError(null);
    setReplaceOptimizeNotice(null);
    setReplaceOptimizeProgress(null);
    setReplaceSourceSize(null);

    if (!file) {
      setReplaceFile(null);
      return;
    }

    try {
      const slice = file.slice(0, 5);
      const buffer = await slice.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      if (
        bytes[0] !== 0x25 ||
        bytes[1] !== 0x50 ||
        bytes[2] !== 0x44 ||
        bytes[3] !== 0x46 ||
        bytes[4] !== 0x2d
      ) {
        setReplaceError("Selected file does not have a valid PDF header (%PDF-).");
        setReplaceFile(null);
        if (replaceFileInputRef.current) replaceFileInputRef.current.value = "";
        return;
      }
    } catch {
      setReplaceError("Could not read file header.");
      setReplaceFile(null);
      if (replaceFileInputRef.current) replaceFileInputRef.current.value = "";
      return;
    }

    if (file.size <= MAX_BROCHURE_FILE_SIZE_BYTES) {
      setReplaceFile(file);
      return;
    }

    // Check configured maximum browser source limit before reading file into memory
    if (file.size > maxSourceSizeBytes) {
      setReplaceError(
        `This PDF is ${formatFileSize(file.size)}, which is above the current browser processing limit of ${maxSourceMb} MB.`,
      );
      setReplaceFile(null);
      if (replaceFileInputRef.current) replaceFileInputRef.current.value = "";
      return;
    }

    // Oversized (>25 MB and <= configured limit): Optimize locally in the browser with real progress tracking
    setIsOptimizingReplace(true);
    setReplaceFile(null);
    setReplaceSourceSize(formatFileSize(file.size));
    setReplaceOptimizeProgress({
      phase: "reading",
      phaseLabel: "Reading PDF",
      detail: `Reading ${formatFileSize(file.size)} document...`,
      percent: 5,
    });

    try {
      const result = await optimizePdfClient(
        file,
        (progress) => {
          setReplaceOptimizeProgress(progress);
        },
        maxSourceSizeBytes,
      );

      if (result.success && result.file) {
        setReplaceFile(result.file);
        setReplaceOptimizeProgress(null);
        const origStr = formatFileSize(result.originalSizeBytes);
        const optStr = formatFileSize(result.optimizedSizeBytes!);
        const reductionStr = result.reductionPercent
          ? ` (-${result.reductionPercent}%)`
          : "";
        setReplaceOptimizeNotice(
          `Optimized: ${origStr} → ${optStr}${reductionStr}. Ready to upload.`,
        );
      } else {
        setReplaceError(
          result.error ||
            "This PDF could not be reduced below 25 MB. Please choose a smaller PDF.",
        );
        setReplaceOptimizeProgress(null);
        setReplaceOptimizeNotice(null);
        setReplaceFile(null);
        if (replaceFileInputRef.current) replaceFileInputRef.current.value = "";
      }
    } catch {
      setReplaceError("This PDF could not be reduced below 25 MB. Please choose a smaller PDF.");
      setReplaceOptimizeProgress(null);
      setReplaceOptimizeNotice(null);
      setReplaceFile(null);
      if (replaceFileInputRef.current) replaceFileInputRef.current.value = "";
    } finally {
      setIsOptimizingReplace(false);
    }
  };

  // Submit Replace File
  const handleReplaceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isOptimizingReplace) return;
    if (!replacingBrochure || !replaceFile) return;
    setReplaceError(null);

    if (replaceFile.size > MAX_BROCHURE_FILE_SIZE_BYTES) {
      setReplaceError("This PDF could not be reduced below 25 MB. Please choose a smaller PDF.");
      return;
    }

    const validation = await validatePdfFileClient(replaceFile);
    if (!validation.valid) {
      setReplaceError(validation.error || "Invalid PDF file.");
      return;
    }

    setIsSubmittingReplace(true);
    setReplaceProgress(0);

    const formData = new FormData();
    formData.append("file", replaceFile);

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api/brochures/${replacingBrochure.id}/file`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setReplaceProgress(percent);
      }
    };

    xhr.onload = () => {
      setIsSubmittingReplace(false);
      try {
        const res = JSON.parse(xhr.responseText);
        if (xhr.status === 200 && res.success && res.brochure) {
          setBrochures((prev) =>
            prev.map((b) => (b.id === res.brochure.id ? res.brochure : b)),
          );
          setReplacingBrochure(null);
          return;
        }
      } catch {
        // Fall through to parseXhrErrorMessage
      }

      setReplaceError(parseXhrErrorMessage(xhr, "File replacement failed. Please try again."));
      setReplaceProgress(null);
    };

    xhr.onerror = () => {
      setIsSubmittingReplace(false);
      setReplaceProgress(null);
      setReplaceError("Network error while replacing file.");
    };

    xhr.send(formData);
  };

  // Archive Action
  const handleArchive = async (brochure: Brochure) => {
    try {
      const res = await fetch(`/api/brochures/${brochure.id}/archive`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.brochure) {
        setBrochures((prev) =>
          prev.map((b) => (b.id === data.brochure.id ? data.brochure : b)),
        );
        setConfirmArchiveBrochure(null);
      }
    } catch (err) {
      console.error("Archive error:", err);
    }
  };

  // Restore Action
  const handleRestore = async (brochure: Brochure) => {
    try {
      const res = await fetch(`/api/brochures/${brochure.id}/restore`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.brochure) {
        setBrochures((prev) =>
          prev.map((b) => (b.id === data.brochure.id ? data.brochure : b)),
        );
        setConfirmRestoreBrochure(null);
      }
    } catch (err) {
      console.error("Restore error:", err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="text-xl font-bold text-ink">Cloud Brochure Library</h1>
          <p className="text-xs text-subtle mt-0.5">
            Store and manage property brochures in private cloud storage.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {userRole === "admin" && (
            <Link
              href="/settings/system"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-line bg-panel hover:bg-canvas text-subtle hover:text-ink text-xs font-medium transition-colors shadow-2xs"
              title="Configure PDF browser processing limit in System Settings"
            >
              <svg className="w-3.5 h-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>PDF Limit: {maxSourceMb} MB</span>
            </Link>
          )}

          <button
            type="button"
            onClick={openUploadModal}
            className="inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent/90 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Upload brochure
          </button>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-panel border border-line rounded-xl p-4 flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center shadow-2xs">
        {/* Active / Archived Tabs */}
        <div className="flex items-center bg-canvas p-1 rounded-lg border border-line shrink-0">
          <button
            type="button"
            onClick={() => setTab("active")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              tab === "active"
                ? "bg-panel text-ink shadow-2xs"
                : "text-subtle hover:text-ink"
            }`}
          >
            Active (
            {brochures.filter((b) => b.archived_at === null).length})
          </button>
          <button
            type="button"
            onClick={() => setTab("archived")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              tab === "archived"
                ? "bg-panel text-ink shadow-2xs"
                : "text-subtle hover:text-ink"
            }`}
          >
            Archived (
            {brochures.filter((b) => b.archived_at !== null).length})
          </button>
        </div>

        {/* Search & Project Filter */}
        <div className="flex flex-col sm:flex-row items-center gap-3 flex-1 max-w-xl">
          <div className="relative w-full">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-subtle">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by title, project, description..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-panel border border-line rounded-lg text-ink placeholder:text-subtle focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-subtle hover:text-ink"
              >
                ✕
              </button>
            )}
          </div>

          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="w-full sm:w-48 py-1.5 px-3 text-xs bg-panel border border-line rounded-lg text-ink focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="all">All Projects</option>
            <option value="general">General (No Project)</option>
            {allProjects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Brochure Table */}
      <div className="bg-panel border border-line rounded-xl overflow-hidden shadow-2xs">
        {filteredBrochures.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-400">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-ink">No brochures found</h3>
            <p className="text-xs text-subtle mt-1 max-w-sm mx-auto">
              {tab === "active"
                ? "There are no active brochures matching your filters. Click 'Upload brochure' to add one."
                : "No archived brochures found."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-canvas border-b border-line text-[11px] font-bold text-subtle uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Title & Details</th>
                  <th className="py-3 px-4">Project</th>
                  <th className="py-3 px-4">Size</th>
                  <th className="py-3 px-4">Last Updated</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredBrochures.map((b) => (
                  <tr key={b.id} className="hover:bg-canvas/50 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-ink text-sm flex items-center gap-2">
                        <span>{b.title}</span>
                        {b.archived_at && (
                          <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold uppercase">
                            Archived
                          </span>
                        )}
                      </div>
                      {b.description && (
                        <p className="text-subtle text-xs mt-0.5 line-clamp-1">{b.description}</p>
                      )}
                      <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                        {b.original_filename || "brochure.pdf"}
                      </p>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {b.project_name ? (
                        <span className="inline-block bg-slate-100 text-slate-800 px-2.5 py-0.5 rounded font-medium text-xs">
                          {b.project_name}
                        </span>
                      ) : (
                        <span className="text-subtle italic text-xs">General</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-ink font-medium whitespace-nowrap">
                      {formatFileSize(Number(b.file_size_bytes))}
                    </td>

                    <td className="py-3.5 px-4 text-subtle whitespace-nowrap">
                      <p>{formatDate(b.file_uploaded_at || b.updated_at)}</p>
                      <p className="text-[10px] text-slate-400">
                        {formatDateTime(b.updated_at).split(",")[1]?.trim()}
                      </p>
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {/* Download link */}
                        <a
                          href={`/api/brochures/${b.id}/download`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-subtle hover:text-accent rounded hover:bg-canvas transition-colors"
                          title="Download PDF"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </a>

                        {/* Edit metadata */}
                        <button
                          type="button"
                          onClick={() => openEditModal(b)}
                          className="p-1.5 text-subtle hover:text-ink rounded hover:bg-canvas transition-colors"
                          title="Edit Metadata"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>

                        {/* Replace File */}
                        <button
                          type="button"
                          onClick={() => openReplaceModal(b)}
                          className="p-1.5 text-subtle hover:text-ink rounded hover:bg-canvas transition-colors"
                          title="Replace PDF File"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                        </button>

                        {/* Archive / Restore */}
                        {b.archived_at ? (
                          <button
                            type="button"
                            onClick={() => setConfirmRestoreBrochure(b)}
                            className="px-2 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded transition-colors"
                          >
                            Restore
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmArchiveBrochure(b)}
                            className="px-2 py-1 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded transition-colors"
                          >
                            Archive
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Datalist for Project Suggestions */}
      <datalist id="known-projects-list">
        {allProjects.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      {/* ── 1. UPLOAD DIALOG ────────────────────────────────────── */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
          <div className="bg-panel border border-line rounded-2xl w-full max-w-lg shadow-2xl p-6 relative animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-line mb-4">
              <div>
                <h2 className="text-base font-bold text-ink">Upload Brochure</h2>
                <p className="text-xs text-subtle">
                  Upload a PDF (up to 25 MB) to private cloud storage. Files over 25 MB are automatically optimized locally.
                </p>
              </div>
              <button
                type="button"
                onClick={closeUploadModal}
                disabled={isSubmittingUpload || isOptimizingUpload}
                className="text-subtle hover:text-ink text-sm p-1 rounded"
              >
                ✕
              </button>
            </div>

            {uploadError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-start gap-2">
                <span>⚠️</span>
                <span>{uploadError}</span>
              </div>
            )}

            {duplicateWarning && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg flex items-start gap-2">
                <span>ℹ️</span>
                <span>
                  A brochure titled &quot;{uploadTitle}&quot; already exists for this project.
                  You can proceed if this is an intentional separate document.
                </span>
              </div>
            )}

            <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-ink mb-1">
                  Brochure Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="e.g. Master Brochure & Layout Plan"
                  className="w-full px-3 py-2 border border-line rounded-lg text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              <div>
                <label className="block font-semibold text-ink mb-1">
                  Project Name <span className="text-subtle font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  list="known-projects-list"
                  value={uploadProject}
                  onChange={(e) => setUploadProject(e.target.value)}
                  placeholder="e.g. Ashiyana Heights"
                  className="w-full px-3 py-2 border border-line rounded-lg text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <p className="text-[11px] text-subtle mt-0.5">
                  Leave empty if this is general or corporate RBA collateral.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-ink mb-1">
                  Description <span className="text-subtle font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={uploadDesc}
                  onChange={(e) => setUploadDesc(e.target.value)}
                  placeholder="Brief summary of what this brochure contains..."
                  className="w-full px-3 py-2 border border-line rounded-lg text-ink focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-ink mb-1">
                  PDF File <span className="text-red-500">*</span>
                </label>
                <div className="border-2 border-dashed border-line rounded-xl p-4 text-center hover:bg-canvas transition-colors">
                  <input
                    ref={uploadFileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    required
                    disabled={isSubmittingUpload || isOptimizingUpload}
                    onChange={handleUploadFileChange}
                    className="block w-full text-xs text-subtle file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-ink hover:file:bg-slate-200 cursor-pointer disabled:opacity-50"
                  />
                  {isOptimizingUpload && uploadOptimizeProgress && (
                    <div className="p-3 bg-blue-50/90 border border-blue-200 rounded-xl space-y-2.5 mt-3 text-left animate-in fade-in duration-150">
                      <div className="flex items-center justify-between text-xs font-semibold text-blue-900">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 animate-spin text-blue-600 shrink-0" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          <span>{uploadOptimizeProgress.phaseLabel}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {uploadSourceSize && (
                            <span className="text-[10px] bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full font-mono">
                              {uploadSourceSize}
                            </span>
                          )}
                          <span className="text-xs font-mono font-bold text-blue-800">
                            {uploadOptimizeProgress.percent !== undefined ? `${uploadOptimizeProgress.percent}%` : ""}
                          </span>
                        </div>
                      </div>

                      {/* Real Progress Bar */}
                      <div className="w-full bg-blue-200/60 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-blue-600 h-full transition-all duration-150 ease-out"
                          style={{ width: `${Math.min(100, Math.max(5, uploadOptimizeProgress.percent ?? 5))}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-blue-700 font-medium">
                        <span>{uploadOptimizeProgress.detail || "Processing..."}</span>
                        {uploadOptimizeProgress.currentImage && uploadOptimizeProgress.totalImages && (
                          <span className="font-mono text-[10px] text-blue-600">
                            {uploadOptimizeProgress.currentImage} of {uploadOptimizeProgress.totalImages} images
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {uploadOptimizeNotice && !isOptimizingUpload && !uploadError && (
                    <div className="flex items-center justify-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium mt-3 animate-in fade-in duration-150">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span>{uploadOptimizeNotice}</span>
                    </div>
                  )}
                  {uploadFile && !isOptimizingUpload && (
                    <p className="text-[11px] text-emerald-700 font-semibold mt-2">
                      Selected: {uploadFile.name} ({formatFileSize(uploadFile.size)})
                    </p>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {uploadProgress !== null && (
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-[11px] text-subtle font-medium">
                    <span>Uploading brochure...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-line rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-accent h-full transition-all duration-150"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <button
                  type="button"
                  disabled={isSubmittingUpload || isOptimizingUpload}
                  onClick={closeUploadModal}
                  className="px-4 py-2 border border-line rounded-lg text-subtle hover:text-ink hover:bg-canvas transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingUpload || isOptimizingUpload || !uploadTitle.trim() || !uploadFile}
                  className="px-4 py-2 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-semibold rounded-lg shadow-sm transition-colors"
                >
                  {isOptimizingUpload
                    ? "Optimizing PDF..."
                    : isSubmittingUpload
                      ? "Uploading..."
                      : "Save brochure"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 2. EDIT METADATA DIALOG ─────────────────────────────── */}
      {editingBrochure && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
          <div className="bg-panel border border-line rounded-2xl w-full max-w-lg shadow-2xl p-6 relative animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-line mb-4">
              <div>
                <h2 className="text-base font-bold text-ink">Edit Brochure Metadata</h2>
                <p className="text-xs text-subtle">
                  Update title, project association, or description.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isSubmittingEdit) setEditingBrochure(null);
                }}
                disabled={isSubmittingEdit}
                className="text-subtle hover:text-ink text-sm p-1 rounded"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-start gap-2">
                <span>⚠️</span>
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-ink mb-1">
                  Brochure Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-line rounded-lg text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              <div>
                <label className="block font-semibold text-ink mb-1">Project Name</label>
                <input
                  type="text"
                  list="known-projects-list"
                  value={editProject}
                  onChange={(e) => setEditProject(e.target.value)}
                  placeholder="e.g. Ashiyana Heights"
                  className="w-full px-3 py-2 border border-line rounded-lg text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              <div>
                <label className="block font-semibold text-ink mb-1">Description</label>
                <textarea
                  rows={2}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-line rounded-lg text-ink focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <button
                  type="button"
                  disabled={isSubmittingEdit}
                  onClick={() => setEditingBrochure(null)}
                  className="px-4 py-2 border border-line rounded-lg text-subtle hover:text-ink hover:bg-canvas transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit || !editTitle.trim()}
                  className="px-4 py-2 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-semibold rounded-lg shadow-sm transition-colors"
                >
                  {isSubmittingEdit ? "Saving..." : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 3. REPLACE FILE DIALOG ─────────────────────────────── */}
      {replacingBrochure && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
          <div className="bg-panel border border-line rounded-2xl w-full max-w-lg shadow-2xl p-6 relative animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-line mb-4">
              <div>
                <h2 className="text-base font-bold text-ink">Replace Brochure File</h2>
                <p className="text-xs text-subtle">
                  Upload a new PDF to replace &quot;{replacingBrochure.title}&quot;.
                </p>
              </div>
              <button
                type="button"
                onClick={closeReplaceModal}
                disabled={isSubmittingReplace || isOptimizingReplace}
                className="text-subtle hover:text-ink text-sm p-1 rounded"
              >
                ✕
              </button>
            </div>

            {replaceError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-start gap-2">
                <span>⚠️</span>
                <span>{replaceError}</span>
              </div>
            )}

            <div className="bg-canvas p-3 rounded-lg border border-line mb-4 text-xs">
              <p className="font-semibold text-ink">Current File:</p>
              <p className="text-subtle font-mono text-[11px] mt-0.5">
                {replacingBrochure.original_filename} (
                {formatFileSize(Number(replacingBrochure.file_size_bytes))})
              </p>
              <p className="text-[10px] text-slate-400 mt-1">
                Last updated {formatDateTime(replacingBrochure.updated_at)}
              </p>
            </div>

            <form onSubmit={handleReplaceSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-ink mb-1">
                  New PDF File <span className="text-red-500">*</span>
                </label>
                <div className="border-2 border-dashed border-line rounded-xl p-4 text-center hover:bg-canvas transition-colors">
                  <input
                    ref={replaceFileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    required
                    disabled={isSubmittingReplace || isOptimizingReplace}
                    onChange={handleReplaceFileChange}
                    className="block w-full text-xs text-subtle file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-ink hover:file:bg-slate-200 cursor-pointer disabled:opacity-50"
                  />
                  {isOptimizingReplace && replaceOptimizeProgress && (
                    <div className="p-3 bg-blue-50/90 border border-blue-200 rounded-xl space-y-2.5 mt-3 text-left animate-in fade-in duration-150">
                      <div className="flex items-center justify-between text-xs font-semibold text-blue-900">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 animate-spin text-blue-600 shrink-0" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          <span>{replaceOptimizeProgress.phaseLabel}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {replaceSourceSize && (
                            <span className="text-[10px] bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded-full font-mono">
                              {replaceSourceSize}
                            </span>
                          )}
                          <span className="text-xs font-mono font-bold text-blue-800">
                            {replaceOptimizeProgress.percent !== undefined ? `${replaceOptimizeProgress.percent}%` : ""}
                          </span>
                        </div>
                      </div>

                      {/* Real Progress Bar */}
                      <div className="w-full bg-blue-200/60 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-blue-600 h-full transition-all duration-150 ease-out"
                          style={{ width: `${Math.min(100, Math.max(5, replaceOptimizeProgress.percent ?? 5))}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-blue-700 font-medium">
                        <span>{replaceOptimizeProgress.detail || "Processing..."}</span>
                        {replaceOptimizeProgress.currentImage && replaceOptimizeProgress.totalImages && (
                          <span className="font-mono text-[10px] text-blue-600">
                            {replaceOptimizeProgress.currentImage} of {replaceOptimizeProgress.totalImages} images
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {replaceOptimizeNotice && !isOptimizingReplace && !replaceError && (
                    <div className="flex items-center justify-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium mt-3 animate-in fade-in duration-150">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span>{replaceOptimizeNotice}</span>
                    </div>
                  )}
                  {replaceFile && !isOptimizingReplace && (
                    <p className="text-[11px] text-emerald-700 font-semibold mt-2">
                      New: {replaceFile.name} ({formatFileSize(replaceFile.size)})
                    </p>
                  )}
                </div>
              </div>

              {replaceProgress !== null && (
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-[11px] text-subtle font-medium">
                    <span>Uploading replacement...</span>
                    <span>{replaceProgress}%</span>
                  </div>
                  <div className="w-full bg-line rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-accent h-full transition-all duration-150"
                      style={{ width: `${replaceProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <button
                  type="button"
                  disabled={isSubmittingReplace || isOptimizingReplace}
                  onClick={closeReplaceModal}
                  className="px-4 py-2 border border-line rounded-lg text-subtle hover:text-ink hover:bg-canvas transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReplace || isOptimizingReplace || !replaceFile}
                  className="px-4 py-2 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-semibold rounded-lg shadow-sm transition-colors"
                >
                  {isOptimizingReplace
                    ? "Optimizing PDF..."
                    : isSubmittingReplace
                      ? "Replacing..."
                      : "Replace file"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 4. CONFIRM ARCHIVE MODAL ─────────────────────────────── */}
      {confirmArchiveBrochure && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
          <div className="bg-panel border border-line rounded-2xl w-full max-w-sm shadow-2xl p-6 relative animate-in fade-in zoom-in-95 duration-150 text-xs">
            <h2 className="text-base font-bold text-ink">Archive Brochure?</h2>
            <p className="text-subtle mt-1">
              &quot;{confirmArchiveBrochure.title}&quot; will be hidden from the Sales team. You
              can restore it at any time.
            </p>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setConfirmArchiveBrochure(null)}
                className="px-3 py-1.5 border border-line rounded-lg text-subtle hover:text-ink hover:bg-canvas transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleArchive(confirmArchiveBrochure)}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg shadow-sm transition-colors"
              >
                Archive brochure
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 5. CONFIRM RESTORE MODAL ─────────────────────────────── */}
      {confirmRestoreBrochure && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs">
          <div className="bg-panel border border-line rounded-2xl w-full max-w-sm shadow-2xl p-6 relative animate-in fade-in zoom-in-95 duration-150 text-xs">
            <h2 className="text-base font-bold text-ink">Restore Brochure?</h2>
            <p className="text-subtle mt-1">
              &quot;{confirmRestoreBrochure.title}&quot; will be active and visible to all sales
              representatives immediately.
            </p>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setConfirmRestoreBrochure(null)}
                className="px-3 py-1.5 border border-line rounded-lg text-subtle hover:text-ink hover:bg-canvas transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleRestore(confirmRestoreBrochure)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-sm transition-colors"
              >
                Restore brochure
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
