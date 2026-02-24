import React from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Authenticated } from "@/context/AuthContext";
import { toast } from "sonner";
import { FLOW } from "@/lib/api-mapping";

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("pendingUserData");
    if (stored) {
      try {
        const data = JSON.parse(stored);
        if (data.name) setName(data.name);
        if (data.email) setEmail(data.email);
      } catch (e) {
        console.error("Failed to parse pending user data");
      }
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await FLOW.createProfile({
        input: {
          name,
          email,
          phone,
          shippingAddress,
        },
      });
      localStorage.removeItem("pendingUserData");
      toast.success("Профиль успешно создан");
      navigate("/profile");
    } catch (error) {
      console.error("Onboarding failed:", error);
      toast.error("Не удалось создать профиль. Попробуйте еще раз.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Authenticated>
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <Header />
        <main className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg border-black shadow-xl rounded-none">
            <CardHeader>
              <CardTitle className="text-3xl font-black uppercase tracking-tighter">ЗАПОЛНИТЕ ПРОФИЛЬ</CardTitle>
              <CardDescription>Расскажите немного о себе, чтобы начать.</CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Полное имя</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="rounded-none border-black focus-visible:ring-black"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Телефон (необязательно)</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="rounded-none border-black focus-visible:ring-black"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Адрес доставки (необязательно)</Label>
                  <Input
                    id="address"
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                    placeholder="Улица, Дом, Квартира, Город"
                    className="rounded-none border-black focus-visible:ring-black"
                  />
                </div>
              </CardContent>

              <div className="p-6 pt-0">
                <Button
                  type="submit"
                  className="w-full bg-black text-white hover:bg-gray-800 rounded-none font-bold uppercase tracking-widest h-12"
                  disabled={loading}
                >
                  {loading ? "Сохранение..." : "ЗАВЕРШИТЬ НАСТРОЙКУ"}
                </Button>
              </div>
            </form>
          </Card>
        </main>
        <Footer />
      </div>
    </Authenticated>
  );
}
