"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings, Bell, Plug, Loader2 } from "lucide-react";

export default function SettingsPage() {
  const [appName, setAppName] = useState("Knowledge Hub");
  const [language, setLanguage] = useState("tr");
  const [emailOnPublish, setEmailOnPublish] = useState(true);
  const [emailOnComment, setEmailOnComment] = useState(true);
  const [emailOnReview, setEmailOnReview] = useState(false);
  const [emailWeeklyDigest, setEmailWeeklyDigest] = useState(true);
  const [slackWebhook, setSlackWebhook] = useState("");
  const [testing, setTesting] = useState(false);

  async function handleTestConnection() {
    setTesting(true);
    await new Promise((r) => setTimeout(r, 1500));
    setTesting(false);
    alert("Bağlantı başarılı!");
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Ayarlar</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Platform ayarlarını yapılandırın
        </p>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">
            <Settings className="size-4" />
            Genel
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="size-4" />
            Bildirimler
          </TabsTrigger>
          <TabsTrigger value="integrations">
            <Plug className="size-4" />
            Entegrasyonlar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>Genel Ayarlar</CardTitle>
              <CardDescription>
                Uygulamanın temel ayarlarını yapılandırın
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="app-name">Uygulama Adı</Label>
                <Input
                  id="app-name"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="Uygulama adı"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="language">Varsayılan Dil</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger id="language" className="w-[240px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tr">Türkçe</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="de">Deutsch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end">
                <Button>Kaydet</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Bildirim Ayarları</CardTitle>
              <CardDescription>
                E-posta bildirimlerini yapılandırın
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Yayın Bildirimi</Label>
                  <p className="text-sm text-muted-foreground">
                    Yeni doküman yayınlandığında bildirim gönder
                  </p>
                </div>
                <Switch checked={emailOnPublish} onCheckedChange={setEmailOnPublish} />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Yorum Bildirimi</Label>
                  <p className="text-sm text-muted-foreground">
                    Dokümana yeni yorum eklendiğinde bildirim gönder
                  </p>
                </div>
                <Switch checked={emailOnComment} onCheckedChange={setEmailOnComment} />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>İnceleme Talebi</Label>
                  <p className="text-sm text-muted-foreground">
                    İnceleme talebi atandığında bildirim gönder
                  </p>
                </div>
                <Switch checked={emailOnReview} onCheckedChange={setEmailOnReview} />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Haftalık Özet</Label>
                  <p className="text-sm text-muted-foreground">
                    Her hafta platform özeti gönder
                  </p>
                </div>
                <Switch checked={emailWeeklyDigest} onCheckedChange={setEmailWeeklyDigest} />
              </div>
              <div className="flex justify-end">
                <Button>Kaydet</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations">
          <Card>
            <CardHeader>
              <CardTitle>Entegrasyonlar</CardTitle>
              <CardDescription>
                Üçüncü parti servislerle entegrasyonları yönetin
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="slack-webhook">Slack Webhook URL</Label>
                <Input
                  id="slack-webhook"
                  value={slackWebhook}
                  onChange={(e) => setSlackWebhook(e.target.value)}
                  placeholder="https://hooks.slack.com/services/..."
                  type="url"
                />
                <p className="text-xs text-muted-foreground">
                  Slack kanalına bildirim göndermek için webhook URL girin
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={!slackWebhook || testing}
                >
                  {testing && <Loader2 className="size-4 animate-spin" />}
                  Test Connection
                </Button>
                <Button>Kaydet</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
