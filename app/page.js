"use client";

import { useState } from "react";

function formatNumber(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("es-MX").format(value);
}

function formatWhen(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Cancun",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function Field({ label, value }) {
  return (
    <div>
      <span className="meta">{label}</span>
      <b>{value}</b>
    </div>
  );
}

function MemberCard({ member, lead = false }) {
  return (
    <article className={lead ? "card is-lead" : "card"} data-testid={lead ? "leader-card" : "candidate-card"} data-tag={member.tag}>
      <div className="card-head">
        <div>
          <h3>{member.name}</h3>
          <span className="meta">{member.roleLabel} · {member.tag}</span>
          {lead ? <span className="badge">Fuera del ranking</span> : null}
        </div>
        {member.rank ? (
          <div className={member.signalCount ? "rank" : "rank is-quiet"} aria-label={`Puesto ${member.rank}`}>
            {member.rank}
          </div>
        ) : null}
      </div>
      <div className="grid">
        <Field label="Ayuntamiento" value={member.profileMissing ? "Perfil no disponible" : member.townHall ?? "—"} />
        <Field label="Copas" value={formatNumber(member.trophies)} />
        <Field label="Donaciones" value={`${formatNumber(member.donations)} dadas / ${formatNumber(member.donationsReceived)} recibidas`} />
        <Field label="Liga" value={member.league} />
        <Field label="Estrellas de guerra" value={member.profileMissing ? "—" : formatNumber(member.warStars)} />
        <Field label="Héroes" value={member.profileMissing ? "—" : member.heroes || "Sin héroes"} />
        <Field label="Guerra" value={member.war.shown ? member.war.label : "—"} />
        <Field label="Liga de clanes" value={member.cwl.shown ? member.cwl.label : "—"} />
        <Field label="Capital" value={member.capitalAttacks == null ? "—" : `${formatNumber(member.capitalAttacks)} ataques`} />
        <Field label="Señales" value={member.signalCount ? String(member.signalCount) : "Ninguna"} />
      </div>
      {member.reasons.length ? (
        <ul className="reasons">
          {member.reasons.map((reason) => (
            <li key={reason.id}>{reason.text}</li>
          ))}
        </ul>
      ) : (
        <p className="quiet">Sin señales en esta revisión.</p>
      )}
    </article>
  );
}

export default function Page() {
  const [tag, setTag] = useState("");
  const [status, setStatus] = useState("idle");
  const [errorCode, setErrorCode] = useState("");
  const [message, setMessage] = useState("");
  const [review, setReview] = useState(null);

  async function onSubmit(event) {
    event.preventDefault();
    setStatus("loading");
    setErrorCode("");
    setMessage("");
    setReview(null);
    try {
      const response = await fetch("/api/clan", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-revision-clan": "1",
        },
        body: JSON.stringify({ tag }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setStatus("error");
        setErrorCode(data?.error || "api_error");
        setMessage(data?.message || "No pude consultar la API oficial.");
        return;
      }
      setReview(data);
      setStatus("ready");
    } catch {
      setStatus("error");
      setErrorCode("api_unreachable");
      setMessage("No pude conectar con el servidor de esta app.");
    }
  }

  const clan = review?.clan;

  return (
    <main className="app">
      <header className="topbar">
        <svg className="mark" viewBox="0 0 64 64" aria-hidden="true">
          <path d="M32 8 52 16v16c0 12.5-8.2 20.8-20 24-11.8-3.2-20-11.5-20-24V16z" fill="#f5c400" stroke="#5a2e0a" strokeWidth="3" />
        </svg>
        <div>
          <h1>Revisión de clan</h1>
          <p>Ranking para revisar · aparte de COC Timers</p>
        </div>
      </header>

      <section className="panel">
        <h2>Mira el clan antes de decidir</h2>
        <p className="lede">
          Escribe la etiqueta y verás los datos oficiales, con la gente ordenada por señales.
          Quien junta más queda arriba. Es un ranking de revisión, no una sentencia. Esta pantalla no saca a nadie del clan.
        </p>
        <form className="search" onSubmit={onSubmit}>
          <label>
            Etiqueta del clan
            <input
              data-testid="clan-tag"
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              placeholder="#ABC123"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              aria-describedby="tag-help"
            />
          </label>
          <button className="btn" data-testid="review-submit" type="submit" disabled={status === "loading"}>
            {status === "loading" ? "Consultando…" : "Revisar clan"}
          </button>
        </form>
        <p className="note" id="tag-help">
          Solo se envía la etiqueta. El token de la API se queda en el servidor.
        </p>
        {message ? (
          <p className="message" role="alert" data-testid="review-message" data-state={errorCode}>{message}</p>
        ) : null}
      </section>

      {review && clan ? (
        <section data-testid="review-results">
          <h2 className="section-title">{clan.name}</h2>
          <div className="stats">
            <article className="stat"><span>Nivel</span><strong>{clan.level ?? "—"}</strong></article>
            <article className="stat"><span>Copas</span><strong>{formatNumber(clan.points)}</strong></article>
            <article className="stat"><span>Capital</span><strong>{formatNumber(clan.capitalPoints)}</strong></article>
            <article className="stat"><span>Requisito</span><strong>{formatNumber(clan.requiredTrophies)} copas</strong></article>
            <article className="stat"><span>Ayuntamiento mínimo</span><strong>{clan.requiredTownhallLevel || "—"}</strong></article>
            <article className="stat"><span>Guerra</span><strong>{clan.warFrequencyLabel}</strong></article>
            <article className="stat"><span>Tipo</span><strong>{clan.typeLabel}</strong></article>
            <article className="stat"><span>Miembros</span><strong>{formatNumber(clan.memberCount)}</strong></article>
            <article className="stat"><span>Liga de guerra</span><strong>{clan.warLeague}</strong></article>
          </div>
          {clan.description ? <p className="banner">{clan.description}</p> : null}

          <h2 className="section-title">Guerra</h2>
          <p className="banner" data-testid="war-note">{review.war.message}</p>

          <h2 className="section-title">Capital del clan</h2>
          <p className="banner">{review.capital.message}</p>
          {review.capital.hallLevel != null ? <p className="note">Salón de la capital, nivel {review.capital.hallLevel}.</p> : null}
          {review.capital.districts.length ? (
            <div className="chips" aria-label="Distritos">
              {review.capital.districts.map((district) => (
                <span className="chip" key={district.name}>{district.name} · nv {district.level}</span>
              ))}
            </div>
          ) : null}
          {review.capital.season ? (
            <>
              <p className="note">
                {review.capital.season.stateLabel}. Botín {formatNumber(review.capital.season.capitalTotalLoot)}.
                Ataques {formatNumber(review.capital.season.totalAttacks)}.
                Distritos rivales destruidos {formatNumber(review.capital.season.enemyDistrictsDestroyed)}.
                Del {formatWhen(review.capital.season.startIso)} al {formatWhen(review.capital.season.endIso)} (hora de Cancún).
              </p>
              <div className="people" aria-label="Quién atacó en la capital">
                {review.capital.season.attackers.map((attacker) => (
                  <span className="person" key={attacker.tag}>
                    {attacker.name}: {formatNumber(attacker.attacks)} ataques, {formatNumber(attacker.looted)} de botín
                  </span>
                ))}
              </div>
            </>
          ) : null}

          <h2 className="section-title">Liga de clanes</h2>
          <p className="banner" data-testid="cwl-note">{review.cwl.message}</p>
          {review.cwl.wars.length ? (
            <div className="people">
              {review.cwl.wars.map((war, index) => (
                <span className="person" key={`${war.opponent}-${index}`}>
                  {war.stateLabel} contra {war.opponent}: {war.ourStars} a {war.theirStars}
                </span>
              ))}
            </div>
          ) : null}

          <h2 className="section-title">Ranking de revisión</h2>
          <p className="note">
            {review.counts.withSignals} con señales, {review.counts.withoutSignals} sin señales.
            Mediana de donaciones del clan: {formatNumber(clan.donationMedian)}.
            Líder y colíderes van aparte.
          </p>
          <div className="roster" data-testid="candidate-list">
            {review.candidates.map((member) => (
              <MemberCard key={member.tag} member={member} />
            ))}
          </div>

          <h2 className="section-title">Líder y colíderes</h2>
          <p className="note">Se listan con sus datos. No entran en el ranking de revisión.</p>
          <div className="roster" data-testid="leadership-list">
            {review.leadership.map((member) => (
              <MemberCard key={member.tag} member={member} lead />
            ))}
          </div>
        </section>
      ) : null}

      <footer className="legal">
        <p>La etiqueta viaja de esta app al servidor y, desde ahí, a la API oficial de Clash of Clans.</p>
        <p>
          This material is unofficial and is not endorsed by Supercell. For more information see{" "}
          <a href="https://www.supercell.com/fan-content-policy" rel="noopener noreferrer" target="_blank">Supercell’s Fan Content Policy</a>.
        </p>
      </footer>
    </main>
  );
}
