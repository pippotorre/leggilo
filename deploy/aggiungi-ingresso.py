# Aggiunge ingresso-leggilo a ~/sistemista/ingresso/compose.yaml (da eseguire in quella cartella)
p = 'compose.yaml'
s = open(p).read()
assert 'ingresso-leggilo' not in s, 'ingresso-leggilo già presente'
assert s.count('\nnetworks:\n') == 1, 'sezione networks non trovata'
blocco = '''  ingresso-leggilo:
    <<: *ingresso
    container_name: ingresso-leggilo
    environment:
      <<: *ambiente
      TS_HOSTNAME: leggilo
    volumes:
      - ./stato/leggilo:/var/lib/tailscale
      - ./serve/leggilo:/config:ro
    networks: [leggilo_default]

'''
s = s.replace('\nnetworks:\n', '\n' + blocco + 'networks:\n', 1)
s = s.rstrip('\n') + '\n  leggilo_default: {external: true}\n'
open(p, 'w').write(s)
print('ok')
