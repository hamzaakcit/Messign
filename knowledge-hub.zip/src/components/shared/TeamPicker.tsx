"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Team {
  id: string;
  name: string;
}

interface TeamPickerProps {
  selectedTeams: string[];
  onChange: (teams: string[]) => void;
  className?: string;
}

export function TeamPicker({
  selectedTeams,
  onChange,
  className,
}: TeamPickerProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/teams")
      .then((res) => res.json())
      .then((data) => setTeams(data.teams ?? data))
      .catch(() => setTeams([]))
      .finally(() => setLoading(false));
  }, []);

  const addTeam = (teamId: string) => {
    if (!selectedTeams.includes(teamId)) {
      onChange([...selectedTeams, teamId]);
    }
  };

  const removeTeam = (teamId: string) => {
    onChange(selectedTeams.filter((id) => id !== teamId));
  };

  const availableTeams = teams.filter((t) => !selectedTeams.includes(t.id));
  const selectedTeamObjects = teams.filter((t) => selectedTeams.includes(t.id));

  return (
    <div className={cn("space-y-2", className)}>
      {selectedTeamObjects.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedTeamObjects.map((team) => (
            <Badge key={team.id} variant="secondary" className="gap-1 pr-1">
              {team.name}
              <button
                type="button"
                onClick={() => removeTeam(team.id)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <Select onValueChange={addTeam} value="">
        <SelectTrigger disabled={loading || availableTeams.length === 0}>
          <SelectValue
            placeholder={
              loading
                ? "Yükleniyor..."
                : availableTeams.length === 0
                  ? "Tüm takımlar seçildi"
                  : "Takım seç..."
            }
          />
        </SelectTrigger>
        <SelectContent>
          {availableTeams.map((team) => (
            <SelectItem key={team.id} value={team.id}>
              {team.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
