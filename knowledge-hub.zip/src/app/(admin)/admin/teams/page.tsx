"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Users } from "lucide-react";

interface Team {
  id: string;
  name: string;
  description: string;
  color: string;
  memberCount: number;
}

const MOCK_TEAMS: Team[] = [
  { id: "1", name: "Platform", description: "Altyapı ve platform geliştirme ekibi", color: "#3B82F6", memberCount: 8 },
  { id: "2", name: "İçerik", description: "İçerik üretimi ve düzenleme ekibi", color: "#8B5CF6", memberCount: 5 },
  { id: "3", name: "Dokümantasyon", description: "Teknik dokümantasyon ekibi", color: "#10B981", memberCount: 4 },
  { id: "4", name: "Kalite", description: "İçerik kalite kontrol ve inceleme ekibi", color: "#F59E0B", memberCount: 3 },
  { id: "5", name: "Destek", description: "Müşteri destek ve geri bildirim ekibi", color: "#EF4444", memberCount: 6 },
];

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>(MOCK_TEAMS);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTeam, setNewTeam] = useState({ name: "", description: "", color: "#3B82F6" });

  function handleCreate() {
    if (!newTeam.name.trim()) return;
    setTeams((prev) => [
      ...prev,
      {
        id: String(prev.length + 1),
        name: newTeam.name,
        description: newTeam.description,
        color: newTeam.color,
        memberCount: 0,
      },
    ]);
    setNewTeam({ name: "", description: "", color: "#3B82F6" });
    setDialogOpen(false);
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Takım Yönetimi</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Takımları oluşturun ve üyeleri yönetin
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              Yeni Takım
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Yeni Takım Oluştur</DialogTitle>
              <DialogDescription>
                Yeni bir takım oluşturmak için aşağıdaki bilgileri doldurun.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="team-name">Takım Adı</Label>
                <Input
                  id="team-name"
                  placeholder="Takım adını girin"
                  value={newTeam.name}
                  onChange={(e) => setNewTeam((t) => ({ ...t, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="team-desc">Açıklama</Label>
                <Input
                  id="team-desc"
                  placeholder="Takım açıklaması"
                  value={newTeam.description}
                  onChange={(e) => setNewTeam((t) => ({ ...t, description: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="team-color">Renk</Label>
                <div className="flex items-center gap-3">
                  <input
                    id="team-color"
                    type="color"
                    value={newTeam.color}
                    onChange={(e) => setNewTeam((t) => ({ ...t, color: e.target.value }))}
                    className="w-10 h-9 rounded border cursor-pointer"
                  />
                  <span className="text-sm text-muted-foreground">{newTeam.color}</span>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                İptal
              </Button>
              <Button onClick={handleCreate}>Oluştur</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {teams.map((team) => (
          <Card key={team.id} className="relative overflow-hidden">
            <div
              className="absolute top-0 left-0 w-full h-1"
              style={{ backgroundColor: team.color }}
            />
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: team.color + "15" }}
                >
                  <Users className="size-4" style={{ color: team.color }} />
                </div>
                <CardTitle className="text-base">{team.name}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                {team.description}
              </p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Users className="size-3.5" />
                  <span>{team.memberCount} üye</span>
                </div>
                <div
                  className="w-4 h-4 rounded-full border border-border"
                  style={{ backgroundColor: team.color }}
                  title={team.color}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
