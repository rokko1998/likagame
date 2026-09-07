#!/usr/bin/env bash
set -euo pipefail

output_dir="${1:-apps/web/public/assets/voice}"
mkdir -p "$output_dir"
voice_tmp_dir="$(mktemp -d)"
trap 'rm -rf "$voice_tmp_dir"' EXIT

generate_voice() {
  local file_name="$1"
  local words_per_minute="$2"
  local audio_filter="$3"
  local phrase="$4"
  local source_path="$voice_tmp_dir/${file_name}.aiff"
  say -v Milena -r "$words_per_minute" -o "$source_path" "$phrase"
  ffmpeg -hide_banner -loglevel error -y -i "$source_path" -af "$audio_filter" -codec:a libmp3lame -b:a 80k "$output_dir/${file_name}.mp3"
}

system_filter="highpass=f=110,lowpass=f=7000,aecho=0.8:0.65:35:0.08"
pik_filter="asetrate=44100*1.055,aresample=44100,atempo=0.948,highpass=f=140,lowpass=f=9000"
nima_filter="asetrate=44100*0.94,aresample=44100,atempo=1.064,aecho=0.8:0.7:45:0.12"

generate_voice "line-intro-signal" 176 "$system_filter" "Станция Маяк семь не отвечает. Внутри остался один слабый сигнал."
generate_voice "line-pik-first-contact" 187 "$pik_filter" "П-приём… Я Пик. Три загрузочных узла почти разряжены. Поможешь запустить меня?"
generate_voice "line-e01-instruction" 180 "$pik_filter" "Разложи шесть пар импульсов поровну между тремя узлами. Перетаскивай капсулы. Или нажми сначала на капсулу, потом на узел."
generate_voice "line-e01-h0" 184 "$pik_filter" "Хм, я всё ещё мигаю. Заряд пока неравный."
generate_voice "line-e01-h1" 180 "$pik_filter" "Посмотри: одинаково ли заряжены все три узла?"
generate_voice "line-e01-h2" 178 "$pik_filter" "Раздавай пары по кругу: по одной каждому узлу, потом ещё круг."
generate_voice "line-e01-h3" 176 "$pik_filter" "Каждому узлу нужны две капсулы. В каждой капсуле по две искры."
generate_voice "line-e01-h4" 172 "$pik_filter" "Одна капсула даёт два. Ещё одна — ещё два. Вместе получается четыре."
generate_voice "line-e01-h5" 168 "$pik_filter" "Сделаем вместе: по две капсулы в каждый узел — это по четыре импульса."
generate_voice "line-e01-success" 188 "$pik_filter" "Есть контакт! Все три узла держат одинаковый заряд. Я снова вижу станцию."
generate_voice "line-input-smoke" 178 "$pik_filter" "Проверим панель связи. Сколько импульсов сейчас работают во всех трёх узлах?"
generate_voice "line-epilogue" 158 "$nima_filter" "Сигнал замечен. Но свет маяка всё ещё спрятан дальше, среди облачных колец…"
