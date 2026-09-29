import React, {useState} from 'react';
import {SafeAreaView, ScrollView, View, Text, Pressable, StyleSheet, Linking} from 'react-native';

const markets = [
 {symbol:'XAU/USD',name:'Or',group:'Métaux'},
 {symbol:'EUR/USD',name:'Euro / Dollar',group:'Forex'},
 {symbol:'BTC/USD',name:'Bitcoin',group:'Crypto'},
 {symbol:'US100',name:'Nasdaq 100',group:'Indices'},
 {symbol:'WTI',name:'Pétrole WTI',group:'Énergie'},
 {symbol:'AAPL',name:'Apple',group:'Actions'}
];

const tabs=['Marchés','Prévisions','Actualités','Paramètres'] as const;
const GREEN='#36D399', BG='#07121E', PANEL='#102234', MUTED='#9BAFC1';

export default function Home(){
 const [tab,setTab]=useState<typeof tabs[number]>('Marchés');
 const [selected,setSelected]=useState('XAU/USD');
 const [horizon,setHorizon]=useState(24);

 return (
  <SafeAreaView style={s.safe}>
   <View style={s.header}>
    <Text style={s.brand}>◈ GLOBAL TRADING AI</Text>
    <Text style={s.sub}>Analyse mondiale · Prototype iOS</Text>
   </View>

   <View style={s.notice}>
    <Text style={s.noticeTitle}>MODE DÉMONSTRATION</Text>
    <Text style={s.noticeText}>
     Aucune cotation en direct ni prévision validée. Aucun ordre réel n'est transmis.
    </Text>
   </View>

   <ScrollView style={s.scroll} contentContainerStyle={{paddingBottom:110}}>
    {tab==='Marchés' && <>
     <Text style={s.title}>Marchés mondiaux</Text>
     <Text style={s.muted}>Choisis un instrument à analyser</Text>

     {markets.map(m=>(
      <Pressable
       key={m.symbol}
       onPress={()=>setSelected(m.symbol)}
       style={[s.market,selected===m.symbol&&s.selected]}
      >
       <View>
        <Text style={s.symbol}>{m.symbol}</Text>
        <Text style={s.muted}>{m.name} · {m.group}</Text>
       </View>
       <Text style={s.chevron}>{selected===m.symbol?'✓':'›'}</Text>
      </Pressable>
     ))}

     <Pressable style={s.primary} onPress={()=>setTab('Prévisions')}>
      <Text style={s.primaryText}>Voir les scénarios →</Text>
     </Pressable>
    </>}

    {tab==='Prévisions' && <>
     <Text style={s.title}>Scénarios · {selected}</Text>
     <Text style={s.muted}>Horizon d'analyse</Text>

     <View style={s.horizons}>
      {[24,48,72].map(h=>(
       <Pressable
        key={h}
        style={[s.pill,h===horizon&&s.pillActive]}
        onPress={()=>setHorizon(h)}
       >
        <Text style={[s.pillText,h===horizon&&{color:BG}]}>{h} h</Text>
       </Pressable>
      ))}
     </View>

     <View style={s.panel}>
      <Text style={s.panelTitle}>Prévisions indisponibles</Text>
      <Text style={s.muted}>
       Le moteur de prévision doit être connecté à une API sécurisée et évalué
       sur des données historiques avant d'afficher des scénarios horaires.
      </Text>
      <Text style={s.detail}>
       Instrument : {selected}{'\n'}
       Horizon : {horizon} heures{'\n'}
       Statut : connexion en attente
      </Text>
     </View>

     <Pressable
      style={s.secondary}
      onPress={()=>Linking.openURL('https://global-trading-analyzer-5m7b8.streamlit.app')}
     >
      <Text style={s.secondaryText}>Ouvrir l'analyseur web existant ↗</Text>
     </Pressable>
    </>}

    {tab==='Actualités' && <>
     <Text style={s.title}>Actualités internationales</Text>
     <View style={s.panel}>
      <Text style={s.panelTitle}>Flux en attente</Text>
      <Text style={s.muted}>
       Les flux économiques seront chargés depuis le serveur, avec source et
       date de publication. Aucune actualité fictive n'est affichée.
      </Text>
     </View>
     <Pressable
      style={s.secondary}
      onPress={()=>Linking.openURL('https://www.federalreserve.gov/newsevents.htm')}
     >
      <Text style={s.secondaryText}>Communiqués de la Fed ↗</Text>
     </Pressable>
    </>}

    {tab==='Paramètres' && <>
     <Text style={s.title}>Paramètres</Text>
     <View style={s.panel}>
      <Text style={s.panelTitle}>Version 0.1.0</Text>
      <Text style={s.muted}>
       Prototype React Native / Expo. Le serveur d'analyse et les connexions
       aux courtiers ne sont pas encore intégrés.
      </Text>
     </View>
     <Text style={s.muted}>
      Ne saisis jamais tes identifiants de courtier dans cette application
      tant qu'une authentification sécurisée n'a pas été mise en place.
     </Text>
    </>}
   </ScrollView>

   <View style={s.nav}>
    {tabs.map(t=>(
     <Pressable key={t} onPress={()=>setTab(t)} style={s.navItem}>
      <Text style={[s.navText,tab===t&&{color:GREEN}]}>{t}</Text>
     </Pressable>
    ))}
   </View>
  </SafeAreaView>
 );
}

const s=StyleSheet.create({
 safe:{flex:1,backgroundColor:BG},
 header:{paddingHorizontal:20,paddingTop:18,paddingBottom:12},
 brand:{color:GREEN,fontSize:21,fontWeight:'800'},
 sub:{color:MUTED,marginTop:5},
 notice:{backgroundColor:'#423018',marginHorizontal:16,padding:12,borderRadius:12,borderWidth:1,borderColor:'#9A6A21'},
 noticeTitle:{color:'#FFD27A',fontWeight:'800',fontSize:12},
 noticeText:{color:'#F4E4C7',marginTop:4,fontSize:12,lineHeight:18},
 scroll:{flex:1,paddingHorizontal:16},
 title:{color:'white',fontSize:26,fontWeight:'800',marginTop:22,marginBottom:7},
 muted:{color:MUTED,lineHeight:21},
 market:{backgroundColor:PANEL,padding:17,borderRadius:14,marginTop:10,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderWidth:1,borderColor:'#1B364B'},
 selected:{borderColor:GREEN},
 symbol:{color:'white',fontSize:19,fontWeight:'700',marginBottom:4},
 chevron:{color:GREEN,fontSize:23},
 primary:{backgroundColor:GREEN,padding:17,borderRadius:13,marginTop:22,alignItems:'center'},
 primaryText:{color:BG,fontWeight:'800'},
 panel:{backgroundColor:PANEL,borderRadius:16,padding:20,marginTop:20,borderWidth:1,borderColor:'#1B364B'},
 panelTitle:{color:'white',fontSize:19,fontWeight:'700',marginBottom:12},
 detail:{color:'#D7E5EF',marginTop:20,lineHeight:27},
 horizons:{flexDirection:'row',gap:10,marginTop:12},
 pill:{borderColor:'#325064',borderWidth:1,borderRadius:9,padding:13,minWidth:80,alignItems:'center'},
 pillActive:{backgroundColor:GREEN,borderColor:GREEN},
 pillText:{color:'white',fontWeight:'700'},
 secondary:{padding:17,borderColor:GREEN,borderWidth:1,borderRadius:13,marginTop:20,alignItems:'center'},
 secondaryText:{color:GREEN,fontWeight:'700'},
 nav:{flexDirection:'row',backgroundColor:'#0D2030',paddingVertical:17,borderTopColor:'#274052',borderTopWidth:1},
 navItem:{flex:1,alignItems:'center'},
 navText:{color:MUTED,fontSize:11,fontWeight:'700'}
});
