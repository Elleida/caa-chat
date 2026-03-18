import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy para la API de ARASAAC, evitando problemas de CORS desde el navegador.
 * GET /api/arasaac?q=palabra  →  { id: number | null }
 *
 * La imagen del pictograma se construye en el cliente como:
 *   https://static.arasaac.org/pictograms/{id}/{id}_300.png
 */
export async function GET(req: NextRequest) {
  const keyword = req.nextUrl.searchParams.get("q");
  if (!keyword) {
    return NextResponse.json({ id: null }, { status: 400 });
  }

  try {
    const url = `https://api.arasaac.org/v1/pictograms/es/search/${encodeURIComponent(keyword)}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      // Revalidar cada hora — los pictogramas no cambian frecuentemente
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return NextResponse.json({ id: null });
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ id: null });
    }

    return NextResponse.json({ id: data[0]._id as number });
  } catch {
    return NextResponse.json({ id: null });
  }
}
