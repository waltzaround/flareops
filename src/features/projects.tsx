import { HarnessConnection, HarnessProject } from "./harness";
import { useOnboarding } from "../lib/onboarding";
import { useState } from "react";
import { ArrowLeft, ArrowUp, FolderGit2, GitBranch, Plus } from "lucide-react";
import { useUI } from "../lib/store";
import { projectsInScope, useProjects } from "../lib/projects";
import { Button } from "../components/ui/button";

import { ProviderPicker } from "./provider-picker";
import {
  defaultProvider,
  providerScopeKey,
  providerLabels,
  useProviders,
} from "../lib/providers";

const starters = [
  ["A web app", "Build a web app that "],
  ["An API", "Build an API that "],
  ["An automation", "Build an automation that "],
] as const;

export function Projects() {
  const { account, mode } = useUI();
  const { projects, createProject, addPrompt } = useProjects();
  const scope = { mode, accountId: account.id, profile: account.profile };
  const provider =
    useProviders((s) => s.configs[providerScopeKey(scope)]) ?? defaultProvider;
  const visible = projectsInScope(projects, scope);
  const [selected, setSelected] = useState<string>();
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const project = visible.find((p) => p.id === selected);
  const reset = () => {
    setSelected(undefined);
    setPrompt("");
    setError("");
  };

  return (
    <div className="page-content projects-page">
      <div className="page-heading">
        <h1>{project ? project.name : "Projects"}</h1>
        {!project && (
          <Button onClick={() => useOnboarding.getState().show()}>
            Set up workspace
          </Button>
        )}
        {project && (
          <Button onClick={reset}>
            <Plus size={16} /> New project
          </Button>
        )}
      </div>
      {project ? (
        <>
          <button className="text-button" onClick={reset}>
            <ArrowLeft size={14} /> All projects
          </button>
          <div className="project-context">
            <span>{project.template}</span>
            <span>{account.name}</span>
            <span className="quiet-tag">
              {project.importSource
                ? project.importSource.status === "imported"
                  ? "Imported"
                  : "Import pending"
                : "Local brief"}
            </span>
          </div>
          <div className="project-thread">
            {project.prompts.map((entry, index) => (
              <article key={entry.id}>
                <header>
                  <strong>
                    {index === 0 ? "Project brief" : "Follow-up prompt"}
                  </strong>
                  <time dateTime={entry.createdAt}>
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </time>
                </header>
                <p>{entry.text}</p>
                <small>
                  {providerLabels[(entry.provider ?? defaultProvider).provider]}
                  {entry.provider?.model ? ` · ${entry.provider.model}` : ""}
                </small>
              </article>
            ))}
          </div>
          <HarnessProject key={project.id} project={project} scope={scope} />
        </>
      ) : (
        <div className="project-intro">
          <div className="project-mark">
            <FolderGit2 size={26} />
          </div>
          <h2>What do you want to build?</h2>
          <p>
            Describe your idea. We’ll work out the name and starting point from
            your prompt.
          </p>
        </div>
      )}
      <div className="project-provider-row">
        <HarnessConnection key={providerScopeKey(scope)} scope={scope} />
        <ProviderPicker scope={scope} config={provider} />
      </div>
      <form
        className="project-composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (!prompt.trim()) return;
          try {
            if (project) addPrompt(project.id, scope, prompt, provider);
            else setSelected(createProject(scope, prompt, provider));
            setPrompt("");
            setError("");
          } catch {
            setError(
              "Could not save this brief on your device. Your prompt is still here; try again.",
            );
          }
        }}
      >
        <label className="project-prompt-label" htmlFor="project-prompt">
          {project ? "Next prompt" : "Project brief"}
        </label>
        <textarea
          id="project-prompt"
          required
          maxLength={20000}
          rows={5}
          value={prompt}
          placeholder={
            project
              ? "Describe the next change…"
              : "Describe what it should do, who it’s for, and what matters most…"
          }
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="project-composer-footer">
          <span>{account.name} · Saved locally</span>
          <Button type="submit" variant="default" disabled={!prompt.trim()}>
            {project ? "Save prompt" : "Create project"}
            <ArrowUp size={16} />
          </Button>
        </div>
        {error && (
          <p role="alert" className="danger">
            {error}
          </p>
        )}
      </form>
      {!project && (
        <>
          <div className="project-starters">
            {starters.map(([label, text]) => (
              <Button
                key={label}
                onClick={() => {
                  setPrompt(text);
                }}
              >
                {label}
              </Button>
            ))}
          </div>
          <section className="project-list">
            <h2>
              Your projects <span>{visible.length}</span>
            </h2>
            {visible.length ? (
              visible.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelected(p.id);
                    setPrompt("");
                    setError("");
                  }}
                >
                  <FolderGit2 size={20} />
                  <span>
                    <strong>{p.name}</strong>
                    <small>
                      {p.template} · {p.prompts.length} saved{" "}
                      {p.prompts.length === 1 ? "prompt" : "prompts"}
                    </small>
                  </span>
                  <span className="quiet-tag">
                    {p.importSource
                      ? p.importSource.status === "imported"
                        ? "Imported"
                        : "Import pending"
                      : "Local brief"}
                  </span>
                </button>
              ))
            ) : (
              <p>Your projects will appear here after you create a brief.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
