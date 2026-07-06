import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DataMigrationDialog, type MigrationChoice } from "./DataMigrationDialog";

describe("DataMigrationDialog", () => {
  it("renders three migration choices", () => {
    const onChoose = vi.fn();
    render(<DataMigrationDialog onChoose={onChoose} onCancel={vi.fn()} />);
    expect(screen.getByTestId("migration-choice-copy")).toBeInTheDocument();
    expect(screen.getByTestId("migration-choice-move")).toBeInTheDocument();
    expect(screen.getByTestId("migration-choice-keep-separate")).toBeInTheDocument();
  });

  it("fires onChoose with the selected choice", () => {
    const onChoose = vi.fn<(c: MigrationChoice) => void>();
    render(<DataMigrationDialog onChoose={onChoose} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByTestId("migration-choice-move"));
    expect(onChoose).toHaveBeenCalledWith("move");
    fireEvent.click(screen.getByTestId("migration-choice-copy"));
    expect(onChoose).toHaveBeenCalledWith("copy");
    fireEvent.click(screen.getByTestId("migration-choice-keep-separate"));
    expect(onChoose).toHaveBeenCalledWith("keep-separate");
  });

  it("fires onCancel when cancel is clicked", () => {
    const onCancel = vi.fn();
    render(<DataMigrationDialog onChoose={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId("migration-cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("disables choices while submitting", () => {
    render(<DataMigrationDialog onChoose={vi.fn()} onCancel={vi.fn()} submitting />);
    expect(screen.getByTestId("migration-choice-copy")).toBeDisabled();
    expect(screen.getByTestId("migration-cancel")).toBeDisabled();
  });
});
